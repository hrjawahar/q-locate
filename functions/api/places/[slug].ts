import { Env, json, parseJson, splitList, photoUrls } from '../../_lib/util'

// GET /api/places/:slug — one published place with all its details.
export const onRequestGet: PagesFunction<Env, 'slug'> = async ({ env, params }) => {
  const slug = String(params.slug)
  const p = await env.DB.prepare("SELECT * FROM places WHERE slug = ? AND status = 'published'")
    .bind(slug).first<Record<string, unknown>>()
  if (!p) return json({ error: 'not_found' }, { status: 404 })

  const id = p.id as number
  const [details, categories, circuits, contacts, photos] = await env.DB.batch([
    p.kind === 'vacation'
      ? env.DB.prepare('SELECT * FROM vacation_details WHERE place_id = ?').bind(id)
      : env.DB.prepare('SELECT * FROM temple_details WHERE place_id = ?').bind(id),
    env.DB.prepare(`SELECT c.slug, c.name FROM place_categories pc JOIN categories c ON c.id = pc.category_id
                    WHERE pc.place_id = ? ORDER BY c.sort`).bind(id),
    env.DB.prepare(`SELECT c.slug, c.name, c.total_count, px.position FROM place_circuits px
                    JOIN circuits c ON c.id = px.circuit_id WHERE px.place_id = ?`).bind(id),
    env.DB.prepare('SELECT type, label, value FROM place_contacts WHERE place_id = ? ORDER BY id').bind(id),
    env.DB.prepare('SELECT r2_key, credit FROM place_photos WHERE place_id = ? ORDER BY sort, id').bind(id),
  ])

  const d = (details.results[0] ?? {}) as Record<string, unknown>
  delete d.place_id
  if (p.kind === 'vacation') d.best_months = splitList(d.best_months).map(Number)
  else d.darshan_hours = parseJson(d.darshan_hours, [])

  const { id: _id, created_by, updated_by, created_at, status, ...pub } = p
  return json({
    ...pub,
    highlights: parseJson<string[]>(p.highlights, []),
    amenities: parseJson<string[]>(p.amenities, []),
    cover: photoUrls(p.cover_photo),
    details: d,
    categories: categories.results,
    circuits: circuits.results,
    contacts: contacts.results,
    photos: (photos.results as { r2_key: string; credit: string | null }[]).map((ph) => ({
      ...photoUrls(ph.r2_key),
      credit: ph.credit,
    })),
  }, { headers: { 'cache-control': 'public, max-age=300' } })
}
