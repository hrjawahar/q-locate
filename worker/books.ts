import { Env, json, parseJson } from './util'

// GET /api/books.json — every published Book Pick with its reviewer credits (small; searched on the device).
export async function booksJson(env: Env) {
  const [b, r] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM books WHERE status = 'published' ORDER BY published_at DESC, id DESC`),
    env.DB.prepare(`SELECT r.book_id, r.handle, r.url FROM book_recs r JOIN books b ON b.id = r.book_id WHERE b.status = 'published' ORDER BY r.sort, r.id`),
  ])
  const recs = new Map<number, { handle: string | null; url: string | null }[]>()
  for (const x of r.results as { book_id: number; handle: string | null; url: string | null }[]) {
    if (!recs.has(x.book_id)) recs.set(x.book_id, [])
    recs.get(x.book_id)!.push({ handle: x.handle, url: x.url })
  }
  const books = (b.results as Record<string, unknown>[]).map((x) => {
    const moodsOk = !parseJson<string[]>(x.ai_pending, []).includes('moods')
    return {
      slug: x.slug, title: x.title, author: x.author, year: x.year, language: x.language, topic: x.topic, pages: x.pages, pitch: x.pitch, published_at: x.published_at,
      genres: parseJson<string[]>(x.genres, []), fiction: x.fiction == null ? null : !!x.fiction, recs: recs.get(x.id as number) ?? [],
      moods: moodsOk ? parseJson<string[]>(x.moods, []) : [], mood_note: moodsOk ? (x.mood_note ?? null) : null,
      setting: x.setting ?? null,
    }
  })
  return json({ books }, { headers: { 'cache-control': 'public, max-age=300' } })
}
