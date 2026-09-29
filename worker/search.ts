import { Env, json } from './util'

// GET /api/search?q=kodai&kind=vacation — server fallback when the on-device index isn't loaded.
export const search = async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60)
  const kind = url.searchParams.get('kind')
  if (q.length < 2) return json({ q, results: [] })

  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`
  const kindFilter = kind === 'vacation' || kind === 'spiritual' ? 'AND p.kind = ?' : ''
  const binds: unknown[] = [like, like, like, like, like, like]
  if (kindFilter) binds.push(kind)

  const { results } = await env.DB.prepare(`
    SELECT p.slug, p.kind, p.name, p.state, p.district_city, p.summary
    FROM places p LEFT JOIN temple_details t ON t.place_id = p.id
    WHERE p.status = 'published'
      AND (p.name LIKE ? ESCAPE '\\' OR p.alt_names LIKE ? ESCAPE '\\' OR p.state LIKE ? ESCAPE '\\'
           OR p.district_city LIKE ? ESCAPE '\\' OR p.tags LIKE ? ESCAPE '\\' OR t.main_deity LIKE ? ESCAPE '\\')
      ${kindFilter}
    ORDER BY CASE WHEN p.name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, p.name
    LIMIT 30`).bind(...binds, like).all()

  return json({ q, results })
}
