import { Env, json, parseJson } from './util'

// GET /api/books.json — every published Book Pick with its reviewer credits (small; searched on the device).
export async function booksJson(env: Env) {
  const [b, r] = await env.DB.batch([
    env.DB.prepare(`SELECT id, slug, title, author, year, language, fiction, genres, topic, pages, pitch, published_at
      FROM books WHERE status = 'published' ORDER BY published_at DESC, id DESC`),
    env.DB.prepare(`SELECT r.book_id, r.handle, r.url FROM book_recs r JOIN books b ON b.id = r.book_id WHERE b.status = 'published' ORDER BY r.sort, r.id`),
  ])
  const recs = new Map<number, { handle: string | null; url: string | null }[]>()
  for (const x of r.results as { book_id: number; handle: string | null; url: string | null }[]) {
    if (!recs.has(x.book_id)) recs.set(x.book_id, [])
    recs.get(x.book_id)!.push({ handle: x.handle, url: x.url })
  }
  const books = (b.results as Record<string, unknown>[]).map(({ id, genres, fiction, ...x }) => ({
    ...x, genres: parseJson<string[]>(genres, []), fiction: fiction == null ? null : !!fiction, recs: recs.get(id as number) ?? [],
  }))
  return json({ books }, { headers: { 'cache-control': 'public, max-age=300' } })
}
