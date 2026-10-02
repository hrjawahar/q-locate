import { json, parseJson } from '../util'
import { AdminEnv, Admin, canPublish, inScope } from './auth'

type Body = Record<string, unknown>

const PLACE_FIELDS = ['kind', 'name', 'alt_names', 'country', 'state', 'district_city', 'city', 'lat', 'lng', 'summary',
  'highlights', 'how_to_reach', 'amenities', 'amenities_notes', 'entry_fee', 'access_effort', 'access_notes', 'timings',
  'tags', 'cover_photo', 'cover_credit', 'ai_pending'] as const
const VAC_FIELDS = ['best_months', 'typical_visit', 'trek_grade', 'trek_notes'] as const
const TEMPLE_FIELDS = ['main_deity', 'tradition', 'significance', 'darshan_hours', 'dress_code', 'festivals',
  'pooja_booking_url', 'photography', 'prasadam'] as const
const JSON_FIELDS = new Set(['highlights', 'amenities', 'darshan_hours', 'ai_pending', 'facilities'])

const clean = (v: unknown, key: string) => {
  if (JSON_FIELDS.has(key)) return Array.isArray(v) ? JSON.stringify(v) : v == null || v === '' ? null : String(v)
  if (key === 'lat' || key === 'lng') { const n = Number(v); return v === '' || v == null || Number.isNaN(n) ? null : n }
  if (key === 'best_months' && Array.isArray(v)) return v.join(',')
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

const slugify = (name: string, state: string) =>
  `${name} ${state}`.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80)

async function audit(env: AdminEnv, a: Admin, action: string, entity: string, id: unknown, diff?: unknown) {
  await env.DB.prepare('INSERT INTO audit_log (actor, action, entity, entity_id, diff) VALUES (?, ?, ?, ?, ?)')
    .bind(a.email, action, entity, String(id), diff === undefined ? null : JSON.stringify(diff)).run()
}

const bumpIndex = (env: AdminEnv) =>
  env.DB.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'index_version'").run()

async function loadPlace(env: AdminEnv, id: number) {
  const p = await env.DB.prepare('SELECT * FROM places WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!p) return null
  const [det, cats, circs, contacts] = await env.DB.batch([
    p.kind === 'vacation'
      ? env.DB.prepare('SELECT * FROM vacation_details WHERE place_id = ?').bind(id)
      : env.DB.prepare('SELECT * FROM temple_details WHERE place_id = ?').bind(id),
    env.DB.prepare('SELECT category_id FROM place_categories WHERE place_id = ?').bind(id),
    env.DB.prepare('SELECT circuit_id, position FROM place_circuits WHERE place_id = ?').bind(id),
    env.DB.prepare('SELECT type, label, value FROM place_contacts WHERE place_id = ? ORDER BY id').bind(id),
  ])
  const kids = await env.DB.batch(CHILDREN.map((c) => env.DB.prepare(`SELECT ${c.cols.join(', ')} FROM ${c.table} WHERE place_id = ? ORDER BY sort, id`).bind(id)))
  const d = (det.results[0] ?? {}) as Record<string, unknown>
  return {
    place: { ...p, highlights: parseJson<string[]>(p.highlights, []), amenities: parseJson<string[]>(p.amenities, []), ai_pending: parseJson<string[]>(p.ai_pending, []) } as Record<string, unknown>,
    details: { ...d, darshan_hours: parseJson(d.darshan_hours, []) },
    category_ids: (cats.results as { category_id: number }[]).map((r) => r.category_id),
    circuits: circs.results,
    contacts: contacts.results,
    ...Object.fromEntries(CHILDREN.map((c, i) => [c.key, (kids[i].results as Record<string, unknown>[]).map((r) =>
      c.key === 'transport' ? { ...r, facilities: parseJson(r.facilities, {}) } : r)])),
  }
}

// Repeatable sections (+ Add): replaced as a whole on every save.
const CHILDREN = [
  { key: 'transport', table: 'place_transport', cols: ['type', 'name', 'code', 'distance_km', 'facilities', 'notes'] },
  { key: 'stays', table: 'place_stays', cols: ['name', 'type', 'distance_km', 'price_from', 'currency', 'price_checked_on', 'phone', 'booking_url', 'is_partner'] },
  { key: 'eateries', table: 'place_eateries', cols: ['name', 'pure_veg', 'distance_km', 'phone', 'is_partner'] },
  { key: 'nearby', table: 'place_nearby', cols: ['name', 'kind', 'distance_km', 'what_to_expect', 'linked_place_id'] },
  { key: 'sources', table: 'place_sources', cols: ['type', 'url', 'creator_handle', 'credit'] },
] as const
const NUM_COLS = new Set(['distance_km', 'price_from', 'linked_place_id'])
const BOOL_COLS = new Set(['is_partner', 'pure_veg'])
const cleanChild = (v: unknown, col: string) => {
  if (BOOL_COLS.has(col)) return v === true || v === 1 || v === '1' ? 1 : 0
  if (NUM_COLS.has(col)) { const n = Number(v); return v === '' || v == null || Number.isNaN(n) ? null : n }
  if (col === 'facilities') return v && typeof v === 'object' ? JSON.stringify(v) : null
  return clean(v, col)
}

function publishProblems(p: Record<string, unknown>, catCount: number) {
  const problems: string[] = []
  if (!p.name) problems.push('Name')
  if (!p.state && (!p.country || p.country === 'India')) problems.push('State (or country for abroad)')
  if (catCount < 1) problems.push('At least 1 category')
  if (parseJson<string[]>(p.highlights, []).filter(Boolean).length < 3) problems.push('At least 3 highlights')
  if (!p.cover_photo) problems.push('Cover photo')
  const ai = parseJson<string[]>(p.ai_pending, [])
  if (ai.length) problems.push(`Check the AI drafts (${ai.join(', ').replace(/_/g, ' ')})`)
  return problems
}

export async function listPlaces(url: URL, env: AdminEnv, a: Admin) {
  const where: string[] = []
  const binds: unknown[] = []
  const kind = url.searchParams.get('kind')
  const status = url.searchParams.get('status')
  const q = url.searchParams.get('q')?.trim()
  if (a.scope !== 'all') { where.push('kind = ?'); binds.push(a.scope) }
  else if (kind === 'vacation' || kind === 'spiritual') { where.push('kind = ?'); binds.push(kind) }
  if (status === 'imported') where.push("needs_review = 1 AND status IN ('draft','review')")
  else if (status === 'stale') where.push("status = 'published' AND (verified_on IS NULL OR verified_on < date('now','-12 months'))")
  else if (status) { where.push('status = ?'); binds.push(status) }
  if (q && /^Q\d+$/i.test(q)) { where.push('wikidata_id = ?'); binds.push(q.toUpperCase()) }
  else if (q) {
    // Every word must appear somewhere (name, other names, town, district, state, tags), so word order and partial names still match.
    for (const w of q.split(/\s+/).filter((x) => x.length > 1).slice(0, 6)) {
      where.push("(name || ' ' || COALESCE(alt_names,'') || ' ' || COALESCE(city,'') || ' ' || COALESCE(district_city,'') || ' ' || COALESCE(state,'') || ' ' || COALESCE(tags,'')) LIKE ?")
      binds.push(`%${w}%`)
    }
  }
  const { results } = await env.DB.prepare(
    `SELECT id, slug, kind, name, country, state, district_city, status, verified_on, updated_at, updated_by, cover_photo, needs_review, ai_pending
     FROM places ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC LIMIT 500`,
  ).bind(...binds).all()
  return json({ places: results })
}

export async function getPlace(id: number, env: AdminEnv, a: Admin) {
  const data = await loadPlace(env, id)
  if (!data || !inScope(a, data.place.kind)) return json({ error: 'not_found' }, { status: 404 })
  return json(data)
}

export async function savePlace(id: number | null, body: Body, env: AdminEnv, a: Admin) {
  const input = (body.place ?? {}) as Body
  const existing = id ? await env.DB.prepare('SELECT * FROM places WHERE id = ?').bind(id).first<Record<string, unknown>>() : null
  if (id && !existing) return json({ error: 'not_found' }, { status: 404 })
  const kind = existing ? existing.kind : input.kind
  if (kind !== 'vacation' && kind !== 'spiritual') return json({ error: 'Choose Vacation or Spiritual' }, { status: 400 })
  if (!inScope(a, kind)) return json({ error: 'Outside your scope' }, { status: 403 })
  if (existing && (existing.status === 'published' || existing.status === 'archived') && !canPublish(a))
    return json({ error: 'Only a publisher or owner can edit a published or archived place' }, { status: 403 })

  const vals: Record<string, unknown> = {}
  for (const f of PLACE_FIELDS) if (f in input) vals[f] = clean(input[f], f)
  vals.kind = kind
  if (!vals.name && !existing) return json({ error: 'Name is required' }, { status: 400 })
  if (!vals.country && !existing) vals.country = 'India'

  let placeId = id
  if (!existing) {
    let slug = slugify(String(vals.name), String(vals.state ?? vals.country ?? ''))
    const taken = await env.DB.prepare('SELECT 1 FROM places WHERE slug = ?').bind(slug).first()
    if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`
    const cols = Object.keys(vals)
    const r = await env.DB.prepare(
      `INSERT INTO places (${cols.join(', ')}, slug, status, created_by, updated_by) VALUES (${cols.map(() => '?').join(', ')}, ?, 'draft', ?, ?)`,
    ).bind(...cols.map((c) => vals[c]), slug, a.email, a.email).run()
    placeId = Number(r.meta.last_row_id)
  } else {
    const cols = Object.keys(vals).filter((c) => c !== 'kind')
    if (cols.length) {
      await env.DB.prepare(
        `UPDATE places SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(...cols.map((c) => vals[c]), a.email, id).run()
    }
  }

  const stmts: D1PreparedStatement[] = []
  const det = (body.details ?? {}) as Body
  const fields = kind === 'vacation' ? VAC_FIELDS : TEMPLE_FIELDS
  const table = kind === 'vacation' ? 'vacation_details' : 'temple_details'
  stmts.push(env.DB.prepare(
    `INSERT OR REPLACE INTO ${table} (place_id, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})`,
  ).bind(placeId, ...fields.map((f) => clean(det[f], f))))

  if (Array.isArray(body.category_ids)) {
    stmts.push(env.DB.prepare('DELETE FROM place_categories WHERE place_id = ?').bind(placeId))
    for (const c of body.category_ids) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO place_categories (place_id, category_id) VALUES (?, ?)').bind(placeId, Number(c)))
  }
  if (Array.isArray(body.circuits)) {
    stmts.push(env.DB.prepare('DELETE FROM place_circuits WHERE place_id = ?').bind(placeId))
    for (const c of body.circuits as Body[]) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO place_circuits (place_id, circuit_id, position) VALUES (?, ?, ?)')
      .bind(placeId, Number(c.circuit_id), c.position === '' || c.position == null ? null : Number(c.position)))
  }
  for (const c of CHILDREN) {
    const rows = body[c.key]
    if (!Array.isArray(rows)) continue
    stmts.push(env.DB.prepare(`DELETE FROM ${c.table} WHERE place_id = ?`).bind(placeId))
    ;(rows as Body[]).forEach((r, i) => {
      const vals = c.cols.map((col) => cleanChild(r[col], col))
      const hasContent = c.key === 'transport' ? (r.name || r.notes) : c.key === 'sources' ? (r.url || r.creator_handle || r.credit) : r.name
      if (!hasContent) return
      stmts.push(env.DB.prepare(`INSERT INTO ${c.table} (place_id, ${c.cols.join(', ')}, sort) VALUES (?, ${c.cols.map(() => '?').join(', ')}, ?)`)
        .bind(placeId, ...vals, i))
    })
  }
  if (Array.isArray(body.contacts)) {
    stmts.push(env.DB.prepare('DELETE FROM place_contacts WHERE place_id = ?').bind(placeId))
    for (const c of body.contacts as Body[]) {
      const value = clean(c.value, 'value')
      if (value) stmts.push(env.DB.prepare('INSERT INTO place_contacts (place_id, type, label, value) VALUES (?, ?, ?, ?)').bind(placeId, String(c.type || 'phone'), clean(c.label, 'label'), value))
    }
  }
  await env.DB.batch(stmts)
  if (existing?.status === 'published') await bumpIndex(env)
  await audit(env, a, existing ? 'update' : 'create', 'place', placeId, existing ? Object.keys(vals) : { name: vals.name })
  return json(await loadPlace(env, placeId!))
}

export async function setStatus(id: number, body: Body, env: AdminEnv, a: Admin) {
  const status = String(body.status)
  if (!['draft', 'review', 'published', 'archived'].includes(status)) return json({ error: 'Bad status' }, { status: 400 })
  const p = await env.DB.prepare('SELECT * FROM places WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!p || !inScope(a, p.kind)) return json({ error: 'not_found' }, { status: 404 })
  if (!canPublish(a) && (status === 'published' || status === 'archived' || p.status === 'published'))
    return json({ error: 'Only a publisher or owner can do this' }, { status: 403 })
  if (status === 'published') {
    const cats = await env.DB.prepare('SELECT count(*) AS n FROM place_categories WHERE place_id = ?').bind(id).first<number>('n')
    const problems = publishProblems(p, cats ?? 0)
    if (problems.length) return json({ error: `Missing before publishing: ${problems.join(', ')}` }, { status: 400 })
  }
  await env.DB.prepare(`UPDATE places SET status = ?, ${status === 'published' ? "needs_review = 0, verified_on = COALESCE(verified_on, date('now')), " : ''}updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, a.email, id).run()
  if (status === 'published' || p.status === 'published') await bumpIndex(env)
  await audit(env, a, `status:${status}`, 'place', id)
  return json({ ok: true, status })
}

/** Publish or archive several places at once; each is checked on its own. */
export async function bulkStatus(body: Body, env: AdminEnv, a: Admin) {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => n > 0).slice(0, 200) : []
  const status = String(body.status)
  const results: { id: number; ok: boolean; error?: string }[] = []
  for (const id of ids) {
    const r = await setStatus(id, { status }, env, a)
    const d = (await r.json()) as { error?: string }
    results.push({ id, ok: r.ok, error: d.error })
  }
  return json({ results })
}

export async function markVerified(id: number, env: AdminEnv, a: Admin) {
  const p = await env.DB.prepare('SELECT kind, status FROM places WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!p || !inScope(a, p.kind)) return json({ error: 'not_found' }, { status: 404 })
  await env.DB.prepare("UPDATE places SET verified_on = date('now'), updated_by = ?, updated_at = datetime('now') WHERE id = ?").bind(a.email, id).run()
  if (p.status === 'published') await bumpIndex(env)
  await audit(env, a, 'verify', 'place', id)
  return json({ ok: true })
}

export async function duplicates(url: URL, env: AdminEnv) {
  const name = (url.searchParams.get('name') ?? '').trim()
  const state = (url.searchParams.get('state') ?? '').trim()
  const exclude = Number(url.searchParams.get('exclude') ?? 0)
  if (name.length < 3) return json({ matches: [] })
  const word = name.split(/\s+/).sort((x, y) => y.length - x.length)[0]
  const { results } = await env.DB.prepare(
    `SELECT id, name, state, status FROM places WHERE id != ? AND (name LIKE ? OR alt_names LIKE ?) AND (? = '' OR state = ?) LIMIT 5`,
  ).bind(exclude, `%${word}%`, `%${word}%`, state, state).all()
  return json({ matches: results })
}

export async function upload(request: Request, env: AdminEnv, a: Admin) {
  const form = await request.formData()
  const big = form.get('large'), small = form.get('small')
  const slug = String(form.get('slug') || 'new').replace(/[^a-z0-9-]/g, '').slice(0, 80) || 'new'
  if (!(big instanceof File) || !(small instanceof File)) return json({ error: 'Two images expected' }, { status: 400 })
  if (big.size > 4_000_000 || small.size > 1_000_000) return json({ error: 'Image too large' }, { status: 400 })
  const key = `places/${slug}/${Date.now().toString(36)}`
  const meta = { httpMetadata: { contentType: 'image/webp' } }
  await env.PHOTOS.put(`${key}-1200.webp`, big.stream(), meta)
  await env.PHOTOS.put(`${key}-400.webp`, small.stream(), meta)
  await audit(env, a, 'upload', 'photo', key)
  return json({ key, full: `/img/${key}-1200.webp`, thumb: `/img/${key}-400.webp` })
}

export async function lookups(env: AdminEnv) {
  const [cats, circs] = await env.DB.batch([
    env.DB.prepare('SELECT id, kind, slug, name FROM categories ORDER BY kind, sort'),
    env.DB.prepare('SELECT id, slug, name, total_count FROM circuits ORDER BY name'),
  ])
  return json({ categories: cats.results, circuits: circs.results })
}

export async function listUsers(env: AdminEnv) {
  const { results } = await env.DB.prepare('SELECT email, name, role, scope, active, invited_by, created_at FROM admins ORDER BY created_at').all()
  return json({ users: results })
}

export async function saveUser(body: Body, env: AdminEnv, a: Admin) {
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.role ?? 'editor'), scope = String(body.scope ?? 'all')
  const active = body.active === false || body.active === 0 ? 0 : 1
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email' }, { status: 400 })
  if (!['owner', 'publisher', 'editor'].includes(role) || !['all', 'vacation', 'spiritual'].includes(scope)) return json({ error: 'Bad role or scope' }, { status: 400 })
  if (email === a.email && (active === 0 || role !== 'owner')) return json({ error: "You can't remove your own owner access" }, { status: 400 })
  await env.DB.prepare(
    `INSERT INTO admins (email, name, role, scope, active, invited_by) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, scope = excluded.scope, active = excluded.active`,
  ).bind(email, clean(body.name, 'name'), role, scope, active, a.email).run()
  await audit(env, a, 'user_save', 'admin', email, { role, scope, active })
  return listUsers(env)
}

export async function activity(env: AdminEnv) {
  const { results } = await env.DB.prepare(
    `SELECT l.at, l.actor, l.action, l.entity, l.entity_id, p.name AS place_name FROM audit_log l
     LEFT JOIN places p ON l.entity = 'place' AND p.id = CAST(l.entity_id AS INTEGER) ORDER BY l.id DESC LIMIT 100`,
  ).all()
  return json({ items: results })
}
