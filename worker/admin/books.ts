// Book Picks: a small, reviewed reading list. Facts from Wikidata (CC0) when it knows the book,
// the rest drafted by AI (with web research) and checked by an admin before publishing.
import { json, parseJson } from '../util'
import { type AdminEnv, type Admin, canPublish } from './auth'
import { sparql, wdSearch, type WdHit } from './sources'

type Env = AdminEnv & { ANTHROPIC_API_KEY?: string; AI_MODEL?: string; AI_WEB_SEARCH?: string }

export const FICTION = ['Literary fiction', 'Thriller', 'Mystery', 'Crime', 'Romance', 'Fantasy', 'Sci-fi', 'Historical fiction', 'Humour', 'Classic', 'Short stories', 'Young adult']
export const NONFICTION = ['Biography', 'Memoir', 'Self-help', 'Business', 'Finance', 'History', 'Science', 'Psychology', 'Philosophy', 'Spirituality', 'Travel', 'Health', 'Poetry', 'True crime']
const GENRES = [...FICTION, ...NONFICTION]
const FIELDS = ['title', 'author', 'year', 'language', 'fiction', 'genres', 'topic', 'pages', 'pitch', 'wikidata_id', 'ai_pending'] as const

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70)
const bump = (env: AdminEnv) => env.DB.prepare("INSERT INTO meta (key, value) VALUES ('books_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1")
const audit = (env: AdminEnv, a: Admin, action: string, id: number) =>
  env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES (?, ?, 'book', ?)").bind(a.email, action, String(id))
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)))
const handleOf = (h: unknown) => { const s = clean(h, 60); return s ? (s.startsWith('@') ? s : `@${s}`) : null }

export async function list(url: URL, env: AdminEnv) {
  const q = url.searchParams.get('q')?.trim() ?? '', status = url.searchParams.get('status') ?? ''
  const where: string[] = [], b: unknown[] = []
  if (status) { where.push('b.status = ?'); b.push(status) }
  for (const w of q.split(/\s+/).filter((x) => x.length > 1).slice(0, 5)) { where.push("(b.title || ' ' || COALESCE(b.author,'') || ' ' || COALESCE(b.genres,'') || ' ' || COALESCE(b.topic,'')) LIKE ?"); b.push(`%${w}%`) }
  const { results } = await env.DB.prepare(`SELECT b.id, b.title, b.author, b.year, b.genres, b.pages, b.status, b.ai_pending, b.updated_at,
      (SELECT count(*) FROM book_recs r WHERE r.book_id = b.id) AS recs
    FROM books b ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.updated_at DESC LIMIT 300`).bind(...b).all()
  return json({ books: results })
}

export async function get(id: number, env: AdminEnv) {
  const m = await env.DB.prepare('SELECT * FROM books WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!m) return json({ error: 'not_found' }, { status: 404 })
  const { results } = await env.DB.prepare('SELECT handle, url, note FROM book_recs WHERE book_id = ? ORDER BY sort, id').bind(id).all()
  return json({ book: { ...m, fiction: m.fiction == null ? null : !!m.fiction, genres: parseJson(m.genres, []), ai_pending: parseJson(m.ai_pending, []) }, recs: results })
}

export async function save(id: number | null, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  const m = (body.book ?? {}) as Record<string, unknown>
  const title = clean(m.title, 160)
  if (!title) return json({ error: 'Title is required' }, { status: 400 })
  const existing = id ? await env.DB.prepare('SELECT status FROM books WHERE id = ?').bind(id).first<{ status: string }>() : null
  if (id && !existing) return json({ error: 'not_found' }, { status: 404 })
  if (existing?.status === 'published' && !canPublish(a)) return json({ error: 'Only a publisher or owner can edit a published book' }, { status: 403 })
  const v: Record<string, unknown> = {
    title, author: clean(m.author, 120), year: num(m.year), language: clean(m.language, 80),
    fiction: m.fiction === true || m.fiction === 1 ? 1 : m.fiction === false || m.fiction === 0 ? 0 : null,
    genres: JSON.stringify(Array.isArray(m.genres) ? m.genres.filter((g) => GENRES.includes(String(g))).slice(0, 4) : []),
    topic: clean(m.topic, 80), pages: num(m.pages), pitch: clean(m.pitch, 300),
    wikidata_id: typeof m.wikidata_id === 'string' && /^Q\d+$/.test(m.wikidata_id) ? m.wikidata_id : null,
    ai_pending: JSON.stringify(Array.isArray(m.ai_pending) ? m.ai_pending : []),
  }
  if (v.wikidata_id) {
    const clash = await env.DB.prepare('SELECT id FROM books WHERE wikidata_id = ? AND id != ?').bind(v.wikidata_id, id ?? 0).first<number>('id')
    if (clash) return json({ error: `Already in Book Picks (book #${clash}) — add the recommendation there`, existing: clash }, { status: 409 })
  }
  let bookId = id
  if (!bookId) {
    let slug = slugify(`${title} ${v.author ?? ''}`) || `book-${Date.now()}`
    if (await env.DB.prepare('SELECT 1 FROM books WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36)}`
    bookId = (await env.DB.prepare(`INSERT INTO books (slug, ${FIELDS.join(', ')}, updated_by) VALUES (?, ${FIELDS.map(() => '?').join(', ')}, ?) RETURNING id`)
      .bind(slug, ...FIELDS.map((f) => v[f]), a.email).first<number>('id'))!
  } else {
    await env.DB.prepare(`UPDATE books SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(...FIELDS.map((f) => v[f]), a.email, bookId).run()
  }
  const recs = Array.isArray(body.recs) ? (body.recs as Record<string, unknown>[]) : []
  await env.DB.batch([
    env.DB.prepare('DELETE FROM book_recs WHERE book_id = ?').bind(bookId),
    ...recs.filter((r) => r.handle || r.url).slice(0, 20).map((r, i) => env.DB.prepare('INSERT INTO book_recs (book_id, handle, url, note, sort) VALUES (?, ?, ?, ?, ?)')
      .bind(bookId, handleOf(r.handle), clean(r.url, 300), clean(r.note, 300), i)),
    audit(env, a, id ? 'update' : 'create', bookId!),
    ...(existing?.status === 'published' ? [bump(env)] : []),
  ])
  return json({ ok: true, id: bookId })
}

export async function setStatus(id: number, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can publish' }, { status: 403 })
  const status = String(body.status)
  if (!['draft', 'published', 'archived'].includes(status)) return json({ error: 'Bad status' }, { status: 400 })
  const m = await env.DB.prepare('SELECT genres, author, pitch, ai_pending FROM books WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!m) return json({ error: 'not_found' }, { status: 404 })
  if (status === 'published') {
    const missing = [!m.author && 'author', !parseJson<string[]>(m.genres, []).length && 'category', !m.pitch && 'why read'].filter(Boolean)
    if (!(await env.DB.prepare('SELECT count(*) AS n FROM book_recs WHERE book_id = ?').bind(id).first<number>('n'))) missing.push('a reviewer credit')
    if (missing.length) return json({ error: `Add ${missing.join(', ')} before publishing` }, { status: 400 })
    if (parseJson<string[]>(m.ai_pending, []).length) return json({ error: 'Check the AI draft (tick “I’ve checked it”) before publishing' }, { status: 400 })
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE books SET status = ?, ${status === 'published' ? "published_at = COALESCE(published_at, datetime('now')), " : ''}updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, a.email, id),
    audit(env, a, status, id), bump(env),
  ])
  return json({ ok: true })
}

export async function remove(id: number, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can delete' }, { status: 403 })
  await env.DB.batch([env.DB.prepare('DELETE FROM books WHERE id = ?').bind(id), audit(env, a, 'delete', id), bump(env)])
  return json({ ok: true })
}

export async function addRec(id: number, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO book_recs (book_id, handle, url, note, sort) VALUES (?, ?, ?, ?, (SELECT COALESCE(max(sort), 0) + 1 FROM book_recs WHERE book_id = ?))')
      .bind(id, handleOf(body.handle), clean(body.url, 300), clean(body.note, 300), id),
    env.DB.prepare("UPDATE books SET updated_by = ?, updated_at = datetime('now') WHERE id = ?").bind(a.email, id),
    audit(env, a, 'add_rec', id), bump(env),
  ])
  return json({ ok: true, id })
}

// ---------- Fill from title: Wikidata facts + AI draft ----------
async function wdBook(title: string, author: string | null) {
  const none: WdHit[] = []
  const hits = (await wdSearch(title, 10).catch(() => none))
  const book = hits.find((h) => /\b(book|novel|memoir|non-fiction|nonfiction|essay|collection|autobiography|biography)\b/i.test(h.description)
    && !/film|series|episode|album|song|character|edition/i.test(h.description)
    && (!author || h.description.toLowerCase().includes(author.toLowerCase().split(/\s+/).pop()!)))
    ?? (author ? undefined : hits.find((h) => /\b(book|novel)\b/i.test(h.description) && !/film|series|edition/i.test(h.description)))
  if (!book) return null
  const rows = await sparql(`SELECT ?date ?authorLabel ?pages ?langLabel ?genreLabel ?article WHERE {
  BIND(wd:${book.id} AS ?b)
  OPTIONAL { ?b wdt:P577 ?date } OPTIONAL { ?b wdt:P50 ?author } OPTIONAL { ?b wdt:P1104 ?pages } OPTIONAL { ?b wdt:P407 ?lang }
  OPTIONAL { ?b wdt:P136 ?genre } OPTIONAL { ?article schema:about ?b ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 200`).catch(() => [])
  const set = (k: string) => [...new Set(rows.map((r) => r[k]?.value).filter((x): x is string => !!x && !/^Q\d+$/.test(x)))]
  const years = set('date').map((d) => Number(d.slice(0, 4))).filter(Boolean)
  return {
    id: book.id, label: book.label, description: book.description, year: years.length ? Math.min(...years) : null,
    authors: set('authorLabel'), pages: Number(set('pages')[0]) || null, languages: set('langLabel'), genres: set('genreLabel').slice(0, 8), wikipedia: set('article')[0] ?? null,
  }
}

const SYSTEM = `You fill short catalogue entries for "Book Picks", a list of reviewed English books (originals or English translations) people can pick from.
Rules:
- Use the facts given and, if a web_search tool is available, 1-3 searches on reliable sites (Wikipedia, the publisher's page, established newspapers and book review sites).
- Never invent. If unsure of a field, leave it empty.
- "pitch": at most 170 characters, in your own words, no spoilers, no hype words (must-read, masterpiece, life-changing), no quotes from reviews.
- Finish with one JSON object and nothing after it.`

const SCHEMA = `Return JSON:
{"title": "common English title", "author": "author name(s)", "year": 0 (first published),
 "language": "\\"English\\" if written in English, else \\"English (translated from X)\\"", "fiction": true | false,
 "genres": ["1-3 from: ${GENRES.join(', ')}"], "topic": "for non-fiction only: the subject in 1-3 words, e.g. Habits, Investing, Mughal history; else \\"\\"",
 "pages": 0 (typical English edition, approximate), "pitch": ""}`

export async function fill(body: Record<string, unknown>, env: Env) {
  const title = clean(body.title, 160)
  if (!title) return json({ error: 'Type a title' }, { status: 400 })
  const author = clean(body.author, 120)
  const wd = await wdBook(title, author)
  if (wd) {
    const dup = await env.DB.prepare('SELECT id, title, status FROM books WHERE wikidata_id = ?').bind(wd.id).first<{ id: number; title: string; status: string }>()
    if (dup) return json({ duplicate: dup })
  }
  const dupTitle = await env.DB.prepare('SELECT id, title, status FROM books WHERE lower(title) = lower(?) AND (? IS NULL OR author IS NULL OR lower(author) LIKE lower(?))')
    .bind(wd?.label ?? title, author, `%${author?.split(/\s+/).pop() ?? ''}%`).first<{ id: number; title: string; status: string }>()
  if (dupTitle) return json({ duplicate: dupTitle })

  const lang = wd?.languages[0] ?? null
  const base = {
    title: wd?.label ?? title, author: wd?.authors.join(', ') || author, year: wd?.year ?? null,
    language: lang ? (/^english$/i.test(lang) ? 'English' : `English (translated from ${lang})`) : null,
    fiction: null as boolean | null, genres: [] as string[], topic: null as string | null, pages: wd?.pages ?? null, pitch: null as string | null,
    wikidata_id: wd?.id ?? null,
  }
  const notes: string[] = [wd ? `Matched Wikidata ${wd.id} (${wd.description})` : 'Not found on Wikidata; AI filled everything — check carefully']
  if (!env.ANTHROPIC_API_KEY) return json({ draft: base, notes: [...notes, 'AI is off (no ANTHROPIC_API_KEY)'] })

  const ask = (web: boolean) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(90_000),
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY!.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 1200, system: SYSTEM,
      ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : { temperature: 0 }),
      messages: [{ role: 'user', content: `${SCHEMA}\n\nBook: ${title}${author ? ` by ${author}` : ''}\nFacts: ${JSON.stringify({ wikidata: wd, reviewer_note: clean(body.note, 300) })}` }],
    }),
  })
  try {
    const web = env.AI_WEB_SEARCH !== 'off'
    let res = await ask(web)
    if (!res.ok && web && res.status === 400) res = await ask(false)
    if (!res.ok) throw new Error(`AI answered ${res.status}`)
    const blocks = ((await res.json()) as { content?: { type: string; text?: string }[] }).content ?? []
    const last = blocks.map((b) => b.type).lastIndexOf('web_search_tool_result')
    const text = blocks.slice(last + 1).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    const raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as Record<string, unknown>
    const s = (k: string, max: number) => clean(typeof raw[k] === 'string' ? (raw[k] as string).replace(/<\/?cite[^>]*>/g, '') : null, max)
    const fiction = typeof raw.fiction === 'boolean' ? raw.fiction : null
    const draft = {
      ...base,
      title: base.wikidata_id ? base.title : s('title', 160) ?? base.title,
      author: base.author ?? s('author', 120),
      year: base.year ?? num(raw.year),
      language: base.language ?? s('language', 80),
      fiction,
      genres: Array.isArray(raw.genres) ? raw.genres.map(String).filter((g) => GENRES.includes(g)).slice(0, 3) : [],
      topic: fiction ? null : s('topic', 80),
      pages: base.pages ?? (num(raw.pages) || null),
      pitch: s('pitch', 220),
    }
    return json({ draft, notes: [...notes, 'AI drafted category, pitch and details'] })
  } catch (e) {
    return json({ draft: base, notes: [...notes, `AI draft failed: ${(e as Error).message.slice(0, 80)}`] })
  }
}
