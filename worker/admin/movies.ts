// Reel Picks: a small, reviewed weekend watch list. Facts from Wikidata (CC0) when it knows the film,
// the rest drafted by AI (with web research) and checked by an admin before publishing.
import { json, parseJson } from '../util'
import { type AdminEnv, type Admin, canPublish } from './auth'
import { sparql, wdSearch, type WdHit } from './sources'

type Env = AdminEnv & { ANTHROPIC_API_KEY?: string; AI_MODEL?: string; AI_WEB_SEARCH?: string }

export const GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
  'History', 'Horror', 'Musical', 'Mystery', 'Romance', 'Sci-fi', 'Sports', 'Thriller', 'War', 'Western']
const FIELDS = ['title', 'year', 'country', 'language', 'subtitles', 'genres', 'doc_topic', 'runtime_min', 'pitch', 'family_friendly', 'wikidata_id', 'ai_pending'] as const

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70)
const bumpIndex = (env: AdminEnv) => env.DB.prepare("INSERT INTO meta (key, value) VALUES ('movies_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1")
const audit = (env: AdminEnv, a: Admin, action: string, id: number) =>
  env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES (?, ?, 'movie', ?)").bind(a.email, action, String(id))
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)))

export async function list(url: URL, env: AdminEnv) {
  const q = url.searchParams.get('q')?.trim() ?? '', status = url.searchParams.get('status') ?? ''
  const where: string[] = [], b: unknown[] = []
  if (status) { where.push('m.status = ?'); b.push(status) }
  for (const w of q.split(/\s+/).filter((x) => x.length > 1).slice(0, 5)) { where.push("(m.title || ' ' || COALESCE(m.country,'') || ' ' || COALESCE(m.genres,'')) LIKE ?"); b.push(`%${w}%`) }
  const { results } = await env.DB.prepare(`SELECT m.id, m.title, m.year, m.country, m.genres, m.runtime_min, m.status, m.ai_pending, m.updated_at,
      (SELECT count(*) FROM movie_recs r WHERE r.movie_id = m.id) AS recs
    FROM movies m ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.updated_at DESC LIMIT 300`).bind(...b).all()
  return json({ movies: results })
}

export async function get(id: number, env: AdminEnv) {
  const m = await env.DB.prepare('SELECT * FROM movies WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!m) return json({ error: 'not_found' }, { status: 404 })
  const { results } = await env.DB.prepare('SELECT handle, url, note FROM movie_recs WHERE movie_id = ? ORDER BY sort, id').bind(id).all()
  return json({ movie: { ...m, genres: parseJson(m.genres, []), ai_pending: parseJson(m.ai_pending, []) }, recs: results })
}

/** Create or update a movie and its recommendations. */
export async function save(id: number | null, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  const m = (body.movie ?? {}) as Record<string, unknown>
  const title = clean(m.title, 160)
  if (!title) return json({ error: 'Title is required' }, { status: 400 })
  const existing = id ? await env.DB.prepare('SELECT status FROM movies WHERE id = ?').bind(id).first<{ status: string }>() : null
  if (id && !existing) return json({ error: 'not_found' }, { status: 404 })
  if (existing?.status === 'published' && !canPublish(a)) return json({ error: 'Only a publisher or owner can edit a published movie' }, { status: 403 })
  const genres = Array.isArray(m.genres) ? m.genres.filter((g) => GENRES.includes(String(g))).slice(0, 4) : []
  const v: Record<string, unknown> = {
    title, year: num(m.year), country: clean(m.country, 80), language: clean(m.language, 80), subtitles: clean(m.subtitles, 80),
    genres: JSON.stringify(genres), doc_topic: clean(m.doc_topic, 80), runtime_min: num(m.runtime_min), pitch: clean(m.pitch, 300),
    family_friendly: m.family_friendly === true || m.family_friendly === 1 ? 1 : m.family_friendly === false || m.family_friendly === 0 ? 0 : null,
    wikidata_id: typeof m.wikidata_id === 'string' && /^Q\d+$/.test(m.wikidata_id) ? m.wikidata_id : null,
    ai_pending: JSON.stringify(Array.isArray(m.ai_pending) ? m.ai_pending : []),
  }
  if (v.wikidata_id) {
    const clash = await env.DB.prepare('SELECT id FROM movies WHERE wikidata_id = ? AND id != ?').bind(v.wikidata_id, id ?? 0).first<number>('id')
    if (clash) return json({ error: `Already in Reel Picks (movie #${clash}) — add the recommendation there`, existing: clash }, { status: 409 })
  }
  let movieId = id
  if (!movieId) {
    let slug = slugify(`${title} ${v.year ?? ''}`) || `movie-${Date.now()}`
    if (await env.DB.prepare('SELECT 1 FROM movies WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36)}`
    movieId = (await env.DB.prepare(`INSERT INTO movies (slug, ${FIELDS.join(', ')}, updated_by) VALUES (?, ${FIELDS.map(() => '?').join(', ')}, ?) RETURNING id`)
      .bind(slug, ...FIELDS.map((f) => v[f]), a.email).first<number>('id'))!
  } else {
    await env.DB.prepare(`UPDATE movies SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(...FIELDS.map((f) => v[f]), a.email, movieId).run()
  }
  const recs = Array.isArray(body.recs) ? (body.recs as Record<string, unknown>[]) : []
  const handleOf = (h: unknown) => { const s = clean(h, 60); return s ? (s.startsWith('@') ? s : `@${s}`) : null }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM movie_recs WHERE movie_id = ?').bind(movieId),
    ...recs.filter((r) => r.handle || r.url).slice(0, 20).map((r, i) => env.DB.prepare('INSERT INTO movie_recs (movie_id, handle, url, note, sort) VALUES (?, ?, ?, ?, ?)')
      .bind(movieId, handleOf(r.handle), clean(r.url, 300), clean(r.note, 300), i)),
    audit(env, a, id ? 'update' : 'create', movieId!),
    ...(existing?.status === 'published' ? [bumpIndex(env)] : []),
  ])
  return json({ ok: true, id: movieId })
}

export async function setStatus(id: number, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can publish' }, { status: 403 })
  const status = String(body.status)
  if (!['draft', 'published', 'archived'].includes(status)) return json({ error: 'Bad status' }, { status: 400 })
  const m = await env.DB.prepare('SELECT title, genres, runtime_min, pitch, ai_pending FROM movies WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!m) return json({ error: 'not_found' }, { status: 404 })
  if (status === 'published') {
    const missing = [!parseJson<string[]>(m.genres, []).length && 'category', !m.runtime_min && 'length', !m.pitch && 'why watch'].filter(Boolean)
    const recs = await env.DB.prepare('SELECT count(*) AS n FROM movie_recs WHERE movie_id = ?').bind(id).first<number>('n')
    if (!recs) missing.push('a reviewer credit')
    if (missing.length) return json({ error: `Add ${missing.join(', ')} before publishing` }, { status: 400 })
    if (parseJson<string[]>(m.ai_pending, []).length) return json({ error: 'Check the AI draft (tick “I’ve checked it”) before publishing' }, { status: 400 })
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE movies SET status = ?, ${status === 'published' ? "published_at = COALESCE(published_at, datetime('now')), " : ''}updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, a.email, id),
    audit(env, a, status, id), bumpIndex(env),
  ])
  return json({ ok: true })
}

export async function remove(id: number, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can delete' }, { status: 403 })
  await env.DB.batch([env.DB.prepare('DELETE FROM movies WHERE id = ?').bind(id), audit(env, a, 'delete', id), bumpIndex(env)])
  return json({ ok: true })
}

/** Add one reviewer's recommendation to a movie that already exists. */
export async function addRec(id: number, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  const h = clean(body.handle, 60)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO movie_recs (movie_id, handle, url, note, sort) VALUES (?, ?, ?, ?, (SELECT COALESCE(max(sort), 0) + 1 FROM movie_recs WHERE movie_id = ?))')
      .bind(id, h ? (h.startsWith('@') ? h : `@${h}`) : null, clean(body.url, 300), clean(body.note, 300), id),
    env.DB.prepare("UPDATE movies SET updated_by = ?, updated_at = datetime('now') WHERE id = ?").bind(a.email, id),
    audit(env, a, 'add_rec', id), bumpIndex(env),
  ])
  return json({ ok: true, id })
}

// ---------- Fill from title: Wikidata facts + AI draft ----------
async function wdFilm(title: string, year: number | null) {
  const none: WdHit[] = []
  const hits = (await wdSearch(year ? `${title} ${year}` : title, 8).catch(() => none))
    .concat(year ? await wdSearch(title, 8).catch(() => none) : none)
  const film = hits.find((h) => /\b(film|movie|documentary)\b/i.test(h.description) && !/series|episode|soundtrack|novel|character/i.test(h.description)
    && (!year || h.description.includes(String(year)) || !/\b(19|20)\d\d\b/.test(h.description)))
  if (!film) return null
  const rows = await sparql(`SELECT ?date ?dur ?countryLabel ?langLabel ?genreLabel ?article WHERE {
  BIND(wd:${film.id} AS ?f)
  OPTIONAL { ?f wdt:P577 ?date } OPTIONAL { ?f wdt:P2047 ?dur } OPTIONAL { ?f wdt:P495 ?country } OPTIONAL { ?f wdt:P364 ?lang }
  OPTIONAL { ?f wdt:P136 ?genre } OPTIONAL { ?article schema:about ?f ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 200`).catch(() => [])
  const set = (k: string) => [...new Set(rows.map((r) => r[k]?.value).filter((x): x is string => !!x && !/^Q\d+$/.test(x)))]
  const years = set('date').map((d) => Number(d.slice(0, 4))).filter(Boolean)
  return {
    id: film.id, label: film.label, description: film.description,
    year: years.length ? Math.min(...years) : null, runtime_min: Number(set('dur')[0]) || null,
    countries: set('countryLabel'), languages: set('langLabel'), genres: set('genreLabel').slice(0, 8), wikipedia: set('article')[0] ?? null,
  }
}

const SYSTEM = `You fill short catalogue entries for "Reel Picks", a list of reviewed movies people can pick from for the weekend.
Rules:
- Use the facts given and, if a web_search tool is available, 1-3 searches on reliable film sites (Wikipedia, official studio/distributor pages, established film databases and newspapers).
- Never invent. If unsure of a field, leave it empty.
- "pitch": at most 170 characters, in your own words, no spoilers, no hype words (must-watch, masterpiece, best ever), no quotes from reviews.
- Finish with one JSON object and nothing after it.`

const SCHEMA = `Return JSON:
{"title": "common English title", "year": 0, "country": "production country, e.g. South Korea", "language": "original language, e.g. Korean",
 "subtitles": "\\"English subtitles\\" if the original language is not English, else \\"\\"",
 "genres": ["1-3 from: ${GENRES.join(', ')}"], "doc_topic": "for documentaries only: the subject, 1-3 words, e.g. Aviation, Wildlife, Space; else \\"\\"",
 "runtime_min": 0, "pitch": "", "family_friendly": true | false | null}`

export async function fill(body: Record<string, unknown>, env: Env) {
  const title = clean(body.title, 160)
  if (!title) return json({ error: 'Type a title' }, { status: 400 })
  const year = num(body.year)
  const wd = await wdFilm(title, year)
  if (wd) {
    const dup = await env.DB.prepare('SELECT id, title, status FROM movies WHERE wikidata_id = ?').bind(wd.id).first<{ id: number; title: string; status: string }>()
    if (dup) return json({ duplicate: dup })
  }
  const dupTitle = await env.DB.prepare('SELECT id, title, status FROM movies WHERE lower(title) = lower(?) AND (? IS NULL OR year IS NULL OR year = ?)').bind(wd?.label ?? title, year, year).first<{ id: number; title: string; status: string }>()
  if (dupTitle) return json({ duplicate: dupTitle })

  const base = {
    title: wd?.label ?? title, year: wd?.year ?? year, country: wd?.countries.join(', ') || null, language: wd?.languages[0] ?? null,
    subtitles: wd?.languages[0] && !/^english$/i.test(wd.languages[0]) ? 'English subtitles' : null,
    genres: [] as string[], doc_topic: null as string | null, runtime_min: wd?.runtime_min ?? null, pitch: null as string | null,
    family_friendly: null as boolean | null, wikidata_id: wd?.id ?? null,
  }
  const notes: string[] = [wd ? `Matched Wikidata ${wd.id} (${wd.description})` : 'Not found on Wikidata; AI filled everything — check carefully']
  if (!env.ANTHROPIC_API_KEY) return json({ draft: base, notes: [...notes, 'AI is off (no ANTHROPIC_API_KEY)'] })

  const ask = (web: boolean) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(90_000),
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY!.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 1200, system: SYSTEM,
      ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : { temperature: 0 }),
      messages: [{ role: 'user', content: `${SCHEMA}\n\nMovie: ${title}${year ? ` (${year})` : ''}\nFacts: ${JSON.stringify({ wikidata: wd, reviewer_note: clean(body.note, 300) })}` }],
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
    const draft = {
      ...base,
      title: base.wikidata_id ? base.title : s('title', 160) ?? base.title,
      year: base.year ?? num(raw.year),
      country: base.country ?? s('country', 80),
      language: base.language ?? s('language', 80),
      subtitles: s('subtitles', 80) ?? base.subtitles,
      genres: Array.isArray(raw.genres) ? raw.genres.map(String).filter((g) => GENRES.includes(g)).slice(0, 3) : [],
      doc_topic: s('doc_topic', 80),
      runtime_min: base.runtime_min ?? (num(raw.runtime_min) || null),
      pitch: s('pitch', 220),
      family_friendly: typeof raw.family_friendly === 'boolean' ? raw.family_friendly : null,
    }
    if (draft.doc_topic && !draft.genres.includes('Documentary')) draft.doc_topic = null
    return json({ draft, notes: [...notes, 'AI drafted category, pitch and details'] })
  } catch (e) {
    return json({ draft: base, notes: [...notes, `AI draft failed: ${(e as Error).message.slice(0, 80)}`] })
  }
}
