import { Env, json, splitList, photoUrls, parseJson } from './util'

// GET /api/index.json — compact list of every published place, for on-device search.
export const indexJson = async (request: Request, env: Env, ctx: ExecutionContext) => {
  const version = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'index_version'").first<string>('value')) ?? '0'
  const cacheKey = new Request(new URL(`/api/index.json?v=${version}&s=3`, request.url).toString())
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const { results } = await env.DB.prepare(`
    SELECT p.slug, p.kind, p.name, p.alt_names, p.country, p.state, p.district_city, p.city, p.tags,
           p.access_effort, p.access_notes, p.cover_photo, p.summary, p.highlights, v.best_months, v.typical_visit, t.main_deity, t.darshan_hours,
           t.tradition, t.significance, t.festivals, t.prasadam, t.dress_code, t.photography, p.how_to_reach, p.timings, p.entry_fee,
           p.amenities_notes, v.trek_notes,
           (SELECT group_concat(n.name || ' ' || COALESCE(n.what_to_expect, ''), ' . ') FROM place_nearby n WHERE n.place_id = p.id) AS nearby_text,
           (SELECT group_concat(tr.name || ' ' || COALESCE(tr.code, '') || ' ' || COALESCE(tr.notes, ''), ' . ') FROM place_transport tr WHERE tr.place_id = p.id) AS transport_text,
           (SELECT group_concat(st.name, ' . ') FROM place_stays st WHERE st.place_id = p.id) AS stays_text,
           (SELECT group_concat(e.name, ' . ') FROM place_eateries e WHERE e.place_id = p.id) AS eat_text,
           (SELECT group_concat(ci.name, ' ') FROM place_circuits px JOIN circuits ci ON ci.id = px.circuit_id WHERE px.place_id = p.id) AS circuit_names,
           (SELECT group_concat(c.name, ' ') FROM place_categories pc JOIN categories c ON c.id = pc.category_id
             WHERE pc.place_id = p.id) AS category_names,
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
    // Everything a visitor might search by a word: summary, highlights, temple significance, festivals and so on.
    // Most important first (shown as the "why it matched" snippet), then everything else on the page.
    text: [r.summary, parseJson<string[]>(r.highlights, []).join('. '), r.significance, r.festivals, r.tradition, r.prasadam, r.dress_code, r.photography,
      r.access_notes, r.category_names, r.circuit_names, r.timings, r.entry_fee, r.amenities_notes, r.trek_notes, r.how_to_reach,
      r.nearby_text, r.transport_text, r.stays_text, r.eat_text]
      .filter((x) => typeof x === 'string' && x).join(' \n ').slice(0, 6000),
  }))

  const res = json({ version, count: places.length, places }, {
    headers: { 'cache-control': 'public, max-age=300' },
  })
  ctx.waitUntil(cache.put(cacheKey, res.clone()))
  return res
}
