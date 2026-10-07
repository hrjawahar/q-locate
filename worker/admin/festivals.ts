// Festivals: annual festivals in India and abroad. AI (with web research) drafts the details and this year's
// expected dates; an admin checks them before publishing. Dates of lunar-calendar festivals move every year,
// so "Refresh dates" asks the AI for the next occurrence only.
import { json, parseJson, splitList } from '../util'
import { type AdminEnv, type Admin, canPublish } from './auth'

type Env = AdminEnv & { ANTHROPIC_API_KEY?: string; AI_MODEL?: string; AI_WEB_SEARCH?: string }
const FIELDS = ['name', 'alt_names', 'country', 'state', 'towns', 'kind', 'months', 'next_start', 'next_end', 'dates_checked_on', 'summary', 'tips', 'refs', 'wikidata_id', 'ai_pending'] as const

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70)
const bump = (env: AdminEnv) => env.DB.prepare("INSERT INTO meta (key, value) VALUES ('festivals_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1")
const audit = (env: AdminEnv, a: Admin, action: string, id: number) =>
  env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES (?, ?, 'festival', ?)").bind(a.email, action, String(id))
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null)
const monthList = (v: unknown) => [...new Set((Array.isArray(v) ? v : splitList(v)).map(Number).filter((n) => n >= 1 && n <= 12))].sort((a, b) => a - b)
const KINDS = ['religious', 'cultural', 'both']

export async function list(url: URL, env: AdminEnv) {
  const q = url.searchParams.get('q')?.trim() ?? '', status = url.searchParams.get('status') ?? ''
  const where: string[] = [], b: unknown[] = []
  if (status === 'stale') where.push("f.status = 'published' AND (f.next_end IS NULL OR f.next_end < date('now'))")
  else if (status === 'datescheck') where.push("f.ai_pending LIKE '%dates%'")
  else if (status) { where.push('f.status = ?'); b.push(status) }
  for (const w of q.split(/\s+/).filter((x) => x.length > 1).slice(0, 5)) { where.push("(f.name || ' ' || COALESCE(f.alt_names,'') || ' ' || COALESCE(f.state,'') || ' ' || COALESCE(f.country,'') || ' ' || COALESCE(f.towns,'')) LIKE ?"); b.push(`%${w}%`) }
  const { results } = await env.DB.prepare(`SELECT f.id, f.name, f.country, f.state, f.kind, f.months, f.next_start, f.next_end, f.status, f.ai_pending, f.updated_at
    FROM festivals f ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY f.updated_at DESC LIMIT 500`).bind(...b).all()
  return json({ festivals: results })
}

export async function get(id: number, env: AdminEnv) {
  const f = await env.DB.prepare('SELECT * FROM festivals WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!f) return json({ error: 'not_found' }, { status: 404 })
  const { results } = await env.DB.prepare('SELECT p.id, p.name, p.kind, p.state, p.country FROM festival_places fp JOIN places p ON p.id = fp.place_id WHERE fp.festival_id = ? ORDER BY p.name').bind(id).all()
  return json({ festival: { ...f, months: monthList(f.months), refs: parseJson(f.refs, []), ai_pending: parseJson(f.ai_pending, []) }, places: results })
}

export async function save(id: number | null, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  const m = (body.festival ?? {}) as Record<string, unknown>
  const name = clean(m.name, 160)
  if (!name) return json({ error: 'Name is required' }, { status: 400 })
  const existing = id ? await env.DB.prepare('SELECT status FROM festivals WHERE id = ?').bind(id).first<{ status: string }>() : null
  if (id && !existing) return json({ error: 'not_found' }, { status: 404 })
  if (existing?.status === 'published' && !canPublish(a)) return json({ error: 'Only a publisher or owner can edit a published festival' }, { status: 403 })
  const v: Record<string, unknown> = {
    name, alt_names: clean(m.alt_names, 200), country: clean(m.country, 80), state: clean(m.state, 80), towns: clean(m.towns, 200),
    kind: KINDS.includes(String(m.kind)) ? String(m.kind) : null, months: monthList(m.months).join(',') || null,
    next_start: isoDate(m.next_start), next_end: isoDate(m.next_end) ?? isoDate(m.next_start), dates_checked_on: isoDate(m.dates_checked_on),
    summary: clean(m.summary, 600), tips: clean(m.tips, 300),
    refs: JSON.stringify(Array.isArray(m.refs) ? (m.refs as { url?: string; title?: string }[]).filter((r) => r?.url).slice(0, 8) : []),
    wikidata_id: typeof m.wikidata_id === 'string' && /^Q\d+$/.test(m.wikidata_id) ? m.wikidata_id : null,
    ai_pending: JSON.stringify(Array.isArray(m.ai_pending) ? m.ai_pending : []),
  }
  let fid = id
  if (!fid) {
    let slug = slugify(`${name} ${v.state ?? v.country ?? ''}`) || `festival-${Date.now()}`
    if (await env.DB.prepare('SELECT 1 FROM festivals WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36)}`
    fid = (await env.DB.prepare(`INSERT INTO festivals (slug, ${FIELDS.join(', ')}, updated_by) VALUES (?, ${FIELDS.map(() => '?').join(', ')}, ?) RETURNING id`)
      .bind(slug, ...FIELDS.map((f) => v[f]), a.email).first<number>('id'))!
  } else {
    await env.DB.prepare(`UPDATE festivals SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(...FIELDS.map((f) => v[f]), a.email, fid).run()
  }
  const placeIds = Array.isArray(body.place_ids) ? [...new Set(body.place_ids.map(Number).filter((n) => n > 0))].slice(0, 30) : null
  await env.DB.batch([
    ...(placeIds ? [env.DB.prepare('DELETE FROM festival_places WHERE festival_id = ?').bind(fid),
      ...placeIds.map((p) => env.DB.prepare('INSERT OR IGNORE INTO festival_places (festival_id, place_id) VALUES (?, ?)').bind(fid, p))] : []),
    audit(env, a, id ? 'update' : 'create', fid!),
    ...(existing?.status === 'published' ? [bump(env)] : []),
  ])
  return json({ ok: true, id: fid })
}

export async function setStatus(id: number, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can publish' }, { status: 403 })
  const status = String(body.status)
  if (!['draft', 'published', 'archived'].includes(status)) return json({ error: 'Bad status' }, { status: 400 })
  const f = await env.DB.prepare('SELECT country, months, summary, kind, ai_pending FROM festivals WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!f) return json({ error: 'not_found' }, { status: 404 })
  if (status === 'published') {
    const missing = [!f.country && 'country', !f.months && 'month(s)', !f.kind && 'type', !f.summary && 'what happens'].filter(Boolean)
    if (missing.length) return json({ error: `Add ${missing.join(', ')} before publishing` }, { status: 400 })
    if (parseJson<string[]>(f.ai_pending, []).length) return json({ error: 'Check the AI draft (tick “I’ve checked it”) before publishing' }, { status: 400 })
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE festivals SET status = ?, ${status === 'published' ? "published_at = COALESCE(published_at, datetime('now')), " : ''}updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, a.email, id),
    audit(env, a, status, id), bump(env),
  ])
  return json({ ok: true })
}

export async function remove(id: number, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can delete' }, { status: 403 })
  await env.DB.batch([env.DB.prepare('DELETE FROM festivals WHERE id = ?').bind(id), audit(env, a, 'delete', id), bump(env)])
  return json({ ok: true })
}

// ---------- AI ----------
const SYSTEM = `You fill short, factual entries for the Festivals section of Q-Locate, a travel guide for budget travellers and pilgrims.
Rules:
- Use the web_search tool (2-4 searches) when available. Prefer official tourism boards, government and temple-trust sites, Wikipedia and established newspapers.
- Never invent. If unsure of a field, leave it empty. Dates must come from a source for that year; if no source gives them, leave dates empty.
- Plain, neutral English. No hype words (must-see, best, breathtaking, unmissable). State real cautions plainly (crowds, closures, bookings).
- Finish with one JSON object and nothing after it.`

const today = () => new Date().toISOString().slice(0, 10)

async function ask(env: Env, user: string) {
  const call = (web: boolean) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(100_000),
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY!.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 1600, system: SYSTEM,
      ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] } : { temperature: 0 }),
      messages: [{ role: 'user', content: user }],
    }),
  })
  const web = env.AI_WEB_SEARCH !== 'off'
  let res = await call(web)
  if (!res.ok && web && res.status === 400) res = await call(false)
  if (!res.ok) throw new Error(res.status === 401 ? 'AI key rejected (401)' : `AI answered ${res.status}`)
  const blocks = ((await res.json()) as { content?: { type: string; text?: string; content?: unknown; citations?: { url?: string; title?: string }[] }[] }).content ?? []
  const refs = new Map<string, string>()
  for (const b of blocks) for (const c of b.citations ?? []) if (c.url) refs.set(c.url, c.title ?? c.url)
  if (!refs.size) for (const b of blocks) if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content as { url?: string; title?: string }[]) if (r.url) refs.set(r.url, r.title ?? r.url)
  const last = blocks.map((b) => b.type).lastIndexOf('web_search_tool_result')
  const text = blocks.slice(last + 1).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  const raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as Record<string, unknown>
  return { raw, refs: [...refs].slice(0, 6).map(([url, title]) => ({ url, title: title.slice(0, 160) })) }
}
const s = (raw: Record<string, unknown>, k: string, max: number) => clean(typeof raw[k] === 'string' ? (raw[k] as string).replace(/<\/?cite[^>]*>/g, '') : null, max)

const DATES = `"next_start": "YYYY-MM-DD of the next occurrence on or after TODAY, only if a source states it", "next_end": "YYYY-MM-DD last day (same as start for one-day festivals)"`

/** Draft a festival from its name (and optional country). */
export async function fill(body: Record<string, unknown>, env: Env) {
  const name = clean(body.name, 160)
  if (!name) return json({ error: 'Type a festival name' }, { status: 400 })
  const country = clean(body.country, 80)
  const dup = await env.DB.prepare("SELECT id, name, status FROM festivals WHERE lower(name) = lower(?) OR lower(COALESCE(alt_names,'')) LIKE lower(?)").bind(name, `%${name}%`).first<{ id: number; name: string; status: string }>()
  if (dup) return json({ duplicate: dup })
  if (!env.ANTHROPIC_API_KEY) return json({ draft: { name, country }, notes: ['AI is off (no ANTHROPIC_API_KEY)'] })
  try {
    const { raw, refs } = await ask(env, `TODAY is ${today()}.
Festival: ${name}${country ? ` (${country})` : ''}${clean(body.note, 300) ? `\nNote from the editor: ${clean(body.note, 300)}` : ''}
Return JSON:
{"name": "common English name", "alt_names": "other names, comma separated", "country": "", "state": "state / region / province where it is mainly celebrated, or \\"\\" if nationwide",
 "towns": "main towns or venues to experience it, comma separated", "kind": "religious | cultural | both",
 "months": [usual month numbers 1-12], ${DATES},
 "summary": "2-3 sentences, at most 400 characters: what it is and what a visitor will see", "tips": "one practical line, at most 200 characters: best place to watch, crowds, booking, dress"}`)
    const draft = {
      name: s(raw, 'name', 160) ?? name, alt_names: s(raw, 'alt_names', 200), country: s(raw, 'country', 80) ?? country, state: s(raw, 'state', 80),
      towns: s(raw, 'towns', 200), kind: KINDS.includes(String(raw.kind)) ? String(raw.kind) : null, months: monthList(raw.months),
      next_start: isoDate(raw.next_start), next_end: isoDate(raw.next_end) ?? isoDate(raw.next_start), dates_checked_on: isoDate(raw.next_start) ? today() : null,
      summary: s(raw, 'summary', 600), tips: s(raw, 'tips', 300), refs,
    }
    if (draft.next_end && draft.next_end < today()) { draft.next_start = null; draft.next_end = null; draft.dates_checked_on = null }
    return json({ draft, notes: [`AI drafted the details${draft.next_start ? ' and this year’s dates' : ' (no confirmed dates found)'}; ${refs.length} pages to check`] })
  } catch (e) {
    return json({ draft: { name, country }, notes: [`AI draft failed: ${(e as Error).message.slice(0, 80)}`] })
  }
}

/** Ask the AI for the next dates only; saved as a change for the editor to check (users keep seeing the usual month until then). */
async function refreshCore(id: number, env: Env, actor: string): Promise<{ ok: boolean; same?: boolean; note?: string; next_start?: string; next_end?: string | null; refs?: { url: string; title: string }[] }> {
  const f = await env.DB.prepare('SELECT name, country, state, months, ai_pending, status, next_start, next_end FROM festivals WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!f) return { ok: false, note: 'Festival not found' }
  const { raw, refs } = await ask(env, `TODAY is ${today()}.
Festival: ${f.name} — ${[f.state, f.country].filter(Boolean).join(', ')} (usually in months ${f.months ?? 'unknown'}).
Return JSON: {${DATES}}`)
  const start = isoDate(raw.next_start), end = isoDate(raw.next_end) ?? start
  if (!start || (end && end < today())) return { ok: false, note: 'No confirmed upcoming dates found yet — try again closer to the season.' }
  // Same dates as already confirmed: just note the check, don't ask for re-approval.
  if (start === f.next_start && end === (f.next_end ?? f.next_start) && !parseJson<string[]>(f.ai_pending, []).includes('dates')) {
    await env.DB.prepare("UPDATE festivals SET dates_checked_on = date('now') WHERE id = ?").bind(id).run()
    return { ok: true, same: true, next_start: start, next_end: end, refs }
  }
  const pending = new Set(parseJson<string[]>(f.ai_pending, [])); pending.add('dates')
  await env.DB.batch([
    env.DB.prepare(`UPDATE festivals SET next_start = ?, next_end = ?, dates_checked_on = date('now'), refs = ?, ai_pending = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(start, end, JSON.stringify(refs), JSON.stringify([...pending]), actor, id),
    env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES (?, 'refresh_dates', 'festival', ?)").bind(actor, String(id)),
    ...(f.status === 'published' ? [bump(env)] : []),
  ])
  return { ok: true, next_start: start, next_end: end, refs }
}

export async function refreshDates(id: number, env: Env, a: Admin) {
  const f = await env.DB.prepare('SELECT status FROM festivals WHERE id = ?').bind(id).first<{ status: string }>()
  if (!f) return json({ error: 'not_found' }, { status: 404 })
  if (f.status === 'published' && !canPublish(a)) return json({ error: 'Only a publisher or owner can change a published festival' }, { status: 403 })
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI is off (no ANTHROPIC_API_KEY)' }, { status: 400 })
  return json(await refreshCore(id, env, a.email))
}

// ---------- Refresh all: a small background queue kept in the meta table, worked through by the cron ----------
interface RefreshJob { ids: number[]; total: number; done: number; found: number; same?: number; none: number; failed: number; started: string; by: string }
const JOB = 'fest_refresh'
const readJob = async (env: AdminEnv) => parseJson<RefreshJob | null>(await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(JOB).first<string>('value'), null)
const writeJob = (env: AdminEnv, j: RefreshJob) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(JOB, JSON.stringify(j)).run()

async function startJob(env: AdminEnv, by: string) {
  const { results } = await env.DB.prepare("SELECT id FROM festivals WHERE status = 'published' ORDER BY COALESCE(next_end, '0000') , name").all<{ id: number }>()
  const j: RefreshJob = { ids: results.map((r) => r.id), total: results.length, done: 0, found: 0, same: 0, none: 0, failed: 0, started: new Date().toISOString(), by }
  await writeJob(env, j)
  return j
}

export async function refreshAll(env: Env, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can refresh dates' }, { status: 403 })
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI is off (no ANTHROPIC_API_KEY)' }, { status: 400 })
  const cur = await readJob(env)
  if (cur && cur.ids.length) return json({ job: cur, note: 'Already running' })
  return json({ job: await startJob(env, a.email) })
}
export async function refreshStatus(env: AdminEnv) {
  const pending = await env.DB.prepare("SELECT count(*) AS n FROM festivals WHERE ai_pending LIKE '%dates%'").first<number>('n').catch(() => 0)
  return json({ job: await readJob(env), datesToCheck: pending })
}

/** Cron: work through a couple of festivals per minute; also starts a run by itself on the 1st of each month. */
export async function processRefresh(env: Env, max = 2) {
  if (!env.ANTHROPIC_API_KEY) return
  let j = await readJob(env).catch(() => null)
  const now = new Date(), month = now.toISOString().slice(0, 7)
  if (now.getUTCDate() === 1 && (!j || !j.ids.length)) {
    const last = await env.DB.prepare("SELECT value FROM meta WHERE key = 'fest_auto_month'").first<string>('value').catch(() => null)
    if (last !== month) {
      await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('fest_auto_month', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(month).run()
      j = await startJob(env, 'monthly check')
    }
  }
  if (!j || !j.ids.length) return
  // Claim the next items first so an overlapping run doesn't repeat them.
  const take = j.ids.slice(0, max)
  j.ids = j.ids.slice(max)
  await writeJob(env, j)
  const d = { done: 0, found: 0, same: 0, none: 0, failed: 0 }
  for (const id of take) {
    try { const r = await refreshCore(id, env, j.by); if (r.same) d.same++; else if (r.ok) d.found++; else d.none++ } catch { d.failed++ }
    d.done++
  }
  // Add this run's counts to the latest saved job (another run may have updated it meanwhile).
  const latest = (await readJob(env)) ?? j
  await writeJob(env, { ...latest, done: latest.done + d.done, found: latest.found + d.found, same: (latest.same ?? 0) + d.same, none: latest.none + d.none, failed: latest.failed + d.failed })
}
