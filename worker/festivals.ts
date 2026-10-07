import { Env, json, parseJson, splitList } from './util'

// GET /api/festivals.json — every published festival, with the places it is linked to.
// Dates still waiting for an editor's check are left out (users then see the usual month only).
export async function festivalsJson(env: Env) {
  const [f, p] = await env.DB.batch([
    env.DB.prepare(`SELECT id, slug, name, alt_names, country, state, towns, kind, months, next_start, next_end, dates_checked_on, summary, tips, ai_pending
      FROM festivals WHERE status = 'published' ORDER BY name`),
    env.DB.prepare(`SELECT fp.festival_id, pl.slug, pl.kind, pl.name FROM festival_places fp JOIN places pl ON pl.id = fp.place_id
      JOIN festivals f ON f.id = fp.festival_id WHERE f.status = 'published' AND pl.status = 'published'`),
  ]).catch(() => [{ results: [] }, { results: [] }] as unknown as D1Result[])
  const places = new Map<number, { slug: string; kind: string; name: string }[]>()
  for (const x of p.results as { festival_id: number; slug: string; kind: string; name: string }[]) {
    if (!places.has(x.festival_id)) places.set(x.festival_id, [])
    places.get(x.festival_id)!.push({ slug: x.slug, kind: x.kind, name: x.name })
  }
  const festivals = (f.results as Record<string, unknown>[]).map(({ id, months, ai_pending, next_start, next_end, dates_checked_on, ...x }) => {
    const datesOk = !parseJson<string[]>(ai_pending, []).includes('dates')
    return {
      ...x, months: splitList(months).map(Number),
      next_start: datesOk ? next_start : null, next_end: datesOk ? next_end : null, dates_checked_on: datesOk ? dates_checked_on : null,
      places: places.get(id as number) ?? [],
    }
  })
  return json({ festivals }, { headers: { 'cache-control': 'public, max-age=300' } })
}
