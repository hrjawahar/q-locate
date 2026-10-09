import { Env, json } from './util'

// GET /api/makers.json — published Local Makers (information only).
export async function makersJson(env: Env) {
  const { results } = await env.DB.prepare(`SELECT slug, name, products, category, village, district, state, country, phone, about
    FROM makers WHERE status = 'published' AND consent = 1 ORDER BY state, district, name`).all().catch(() => ({ results: [] }))
  return json({ makers: results }, { headers: { 'cache-control': 'public, max-age=300' } })
}
