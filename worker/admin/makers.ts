// Local Makers: farmers, weavers and artisans listed with their products, village and contact number.
// Information only — Q-Locate does not sell or handle payments.
import { json } from '../util'
import { type AdminEnv, type Admin, canPublish } from './auth'

export const CATEGORIES = ['Handloom & textiles', 'Handicrafts', 'Pottery & terracotta', 'Farm produce', 'Spices, tea & coffee', 'Honey & organic', 'Food & pickles', 'Other']
const FIELDS = ['name', 'products', 'category', 'village', 'district', 'state', 'country', 'phone', 'about', 'consent'] as const
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70)
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
const bump = (env: AdminEnv) => env.DB.prepare("INSERT INTO meta (key, value) VALUES ('makers_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1")
const audit = (env: AdminEnv, a: Admin, action: string, id: number) =>
  env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES (?, ?, 'maker', ?)").bind(a.email, action, String(id))

export async function list(url: URL, env: AdminEnv) {
  const q = url.searchParams.get('q')?.trim() ?? '', status = url.searchParams.get('status') ?? ''
  const where: string[] = [], b: unknown[] = []
  if (status) { where.push('status = ?'); b.push(status) }
  for (const w of q.split(/\s+/).filter((x) => x.length > 1).slice(0, 5)) { where.push("(name || ' ' || COALESCE(products,'') || ' ' || COALESCE(village,'') || ' ' || COALESCE(district,'') || ' ' || COALESCE(state,'')) LIKE ?"); b.push(`%${w}%`) }
  const { results } = await env.DB.prepare(`SELECT id, name, products, category, village, district, state, status, consent, updated_at FROM makers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 500`).bind(...b).all()
  return json({ makers: results })
}

export async function get(id: number, env: AdminEnv) {
  const m = await env.DB.prepare('SELECT * FROM makers WHERE id = ?').bind(id).first<Record<string, unknown>>()
  return m ? json({ maker: { ...m, consent: !!m.consent } }) : json({ error: 'not_found' }, { status: 404 })
}

export async function save(id: number | null, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  const m = (body.maker ?? {}) as Record<string, unknown>
  const name = clean(m.name, 120)
  if (!name) return json({ error: 'Name is required' }, { status: 400 })
  const existing = id ? await env.DB.prepare('SELECT status FROM makers WHERE id = ?').bind(id).first<{ status: string }>() : null
  if (id && !existing) return json({ error: 'not_found' }, { status: 404 })
  if (existing?.status === 'published' && !canPublish(a)) return json({ error: 'Only a publisher or owner can edit a published listing' }, { status: 403 })
  const v: Record<string, unknown> = {
    name, products: clean(m.products, 300), category: CATEGORIES.includes(String(m.category)) ? String(m.category) : null,
    village: clean(m.village, 80), district: clean(m.district, 80), state: clean(m.state, 80), country: clean(m.country, 80) ?? 'India',
    phone: clean(m.phone, 40), about: clean(m.about, 200), consent: m.consent === true || m.consent === 1 ? 1 : 0,
  }
  let mid = id
  if (!mid) {
    let slug = slugify(`${name} ${v.village ?? ''}`) || `maker-${Date.now()}`
    if (await env.DB.prepare('SELECT 1 FROM makers WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36)}`
    mid = (await env.DB.prepare(`INSERT INTO makers (slug, ${FIELDS.join(', ')}, updated_by) VALUES (?, ${FIELDS.map(() => '?').join(', ')}, ?) RETURNING id`)
      .bind(slug, ...FIELDS.map((f) => v[f]), a.email).first<number>('id'))!
  } else {
    await env.DB.prepare(`UPDATE makers SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(...FIELDS.map((f) => v[f]), a.email, mid).run()
  }
  await env.DB.batch([audit(env, a, id ? 'update' : 'create', mid!), ...(existing?.status === 'published' ? [bump(env)] : [])])
  return json({ ok: true, id: mid })
}

export async function setStatus(id: number, body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can publish' }, { status: 403 })
  const status = String(body.status)
  if (!['draft', 'published', 'archived'].includes(status)) return json({ error: 'Bad status' }, { status: 400 })
  const m = await env.DB.prepare('SELECT products, category, village, state, phone, consent FROM makers WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!m) return json({ error: 'not_found' }, { status: 404 })
  if (status === 'published') {
    const missing = [!m.products && 'products', !m.category && 'category', !m.village && 'village', !m.state && 'state', !m.phone && 'contact number'].filter(Boolean)
    if (missing.length) return json({ error: `Add ${missing.join(', ')} before publishing` }, { status: 400 })
    if (!m.consent) return json({ error: 'Tick “The maker agreed to be listed” before publishing' }, { status: 400 })
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE makers SET status = ?, ${status === 'published' ? "published_at = COALESCE(published_at, datetime('now')), " : ''}updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, a.email, id),
    audit(env, a, status, id), bump(env),
  ])
  return json({ ok: true })
}

export async function remove(id: number, env: AdminEnv, a: Admin) {
  if (!canPublish(a)) return json({ error: 'Only a publisher or owner can delete' }, { status: 403 })
  await env.DB.batch([env.DB.prepare('DELETE FROM makers WHERE id = ?').bind(id), audit(env, a, 'delete', id), bump(env)])
  return json({ ok: true })
}
