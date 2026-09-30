import { Env, json, splitList, photoUrls, parseJson } from './util'

// GET /api/index.json — compact list of every published place, for on-device search.
export const indexJson = async (request: Request, env: Env, ctx: ExecutionContext) => {
  const version = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'index_version'").first<string>('value')) ?? '0'
  const cacheKey = new Request(new URL(`/api/index.json?v=${version}`, request.url).toString())
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const { results } = await env.DB.prepare(`
    SELECT p.slug, p.kind, p.name, p.alt_names, p.country, p.state, p.district_city, p.city, p.tags,
           p.access_effort, p.cover_photo, p.summary, v.best_months, v.typical_visit, t.main_deity, t.darshan_hours,
           (SELECT group_concat(c.slug) FROM place_categories pc JOIN categories c ON c.id = pc.category_id
             WHERE pc.place_id = p.id) AS categories,
           (SELECT group_concat(ci.slug) FROM place_circuits px JOIN circuits ci ON ci.id = px.circuit_id
             WHERE px.place_id = p.id) AS circuits
    FROM places p
    LEFT JOIN vacation_details v ON v.place_id = p.id
    LEFT JOIN temple_details t ON t.place_id = p.id
    WHERE p.status = 'published'
    ORDER BY p.name`).all<Record<string, unknown>>()

  const places = results.map((r) => ({
    slug: r.slug,
    kind: r.kind,
    name: r.name,
    alt_names: r.alt_names ?? '',
    country: r.country,
    state: r.state ?? '',
    district_city: r.district_city ?? '',
    city: r.city ?? '',
    tags: r.tags ?? '',
    deity: r.main_deity ?? '',
    categories: splitList(r.categories),
    circuits: splitList(r.circuits),
    best_months: splitList(r.best_months).map(Number),
    typical_visit: r.typical_visit ?? null,
    access_effort: r.access_effort ?? null,
    thumb: photoUrls(r.cover_photo)?.thumb ?? null,
    summary: typeof r.summary === 'string' ? r.summary.slice(0, 200) : '',
    hours: parseJson(r.darshan_hours, []),
  }))

  const res = json({ version, count: places.length, places }, {
    headers: { 'cache-control': 'public, max-age=300' },
  })
  ctx.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}
