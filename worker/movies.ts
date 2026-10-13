import { Env, json, parseJson } from './util'

// GET /api/movies.json — every published Reel Pick with its reviewer credits (small; searched on the device).
export async function moviesJson(env: Env) {
  const [m, r] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM movies WHERE status = 'published' ORDER BY published_at DESC, id DESC`),
    env.DB.prepare(`SELECT r.movie_id, r.handle, r.url FROM movie_recs r JOIN movies m ON m.id = r.movie_id WHERE m.status = 'published' ORDER BY r.sort, r.id`),
  ])
  const recs = new Map<number, { handle: string | null; url: string | null }[]>()
  for (const x of r.results as { movie_id: number; handle: string | null; url: string | null }[]) {
    if (!recs.has(x.movie_id)) recs.set(x.movie_id, [])
    recs.get(x.movie_id)!.push({ handle: x.handle, url: x.url })
  }
  const movies = (m.results as Record<string, unknown>[]).map((x) => {
    const moodsOk = !parseJson<string[]>(x.ai_pending, []).includes('moods')
    return {
      slug: x.slug, title: x.title, year: x.year, country: x.country, language: x.language, subtitles: x.subtitles, doc_topic: x.doc_topic,
      runtime_min: x.runtime_min, pitch: x.pitch, published_at: x.published_at,
      genres: parseJson<string[]>(x.genres, []), family_friendly: x.family_friendly == null ? null : !!x.family_friendly, recs: recs.get(x.id as number) ?? [],
      moods: moodsOk ? parseJson<string[]>(x.moods, []) : [], mood_note: moodsOk ? (x.mood_note ?? null) : null,
      setting: x.setting ?? null,
    }
  })
  return json({ movies }, { headers: { 'cache-control': 'public, max-age=300' } })
}
