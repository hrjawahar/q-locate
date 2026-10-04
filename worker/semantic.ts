// GET /api/semantic?q=… — "closest matches" by meaning, across places, movies and books.
// Results are cached per query (until something is published or changed) and each visitor is limited
// to a sensible number of searches per minute.
import { Env, json } from './util'
import { embed, type SearchBindings } from './embed'

const MIN_SCORE = 0.45
const PER_MINUTE = 40
const hits = new Map<string, { n: number; reset: number }>()

function limited(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60_000 }); if (hits.size > 5000) hits.clear(); return false }
  h.n++
  return h.n > PER_MINUTE
}

export async function semantic(request: Request, env: Env & SearchBindings, ctx: ExecutionContext) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120)
  if (q.length < 3) return json({ results: [] })
  if (!env.AI || !env.VEC) return json({ results: [], off: true })

  const versions = await env.DB.prepare("SELECT group_concat(key || '=' || value, ';') AS v FROM meta WHERE key IN ('index_version', 'movies_version', 'books_version')").first<string>('v')
  const cacheKey = new Request(new URL(`/api/semantic?q=${encodeURIComponent(q)}&v=${encodeURIComponent(versions ?? '')}`, url).toString())
  const cached = await caches.default.match(cacheKey)
  if (cached) return cached
  if (limited(request.headers.get('cf-connecting-ip') ?? 'anon')) return json({ error: 'Too many searches — try again in a minute' }, { status: 429 })

  const [vector] = await embed(env, [q])
  const res = await env.VEC.query(vector, { topK: 20 })
  const matches = res.matches.filter((m) => m.score >= MIN_SCORE)
  const ids = (p: string) => matches.filter((m) => m.id.startsWith(`${p}:`)).map((m) => Number(m.id.slice(2))).filter(Boolean)
  // Only items still published come back (a table that doesn't exist yet just gives nothing).
  const list = async (sql: string, xs: number[]) => xs.length
    ? (await env.DB.prepare(sql.replace('?', xs.map(() => '?').join(','))).bind(...xs).all().catch(() => ({ results: [] }))).results
    : []
  const [p, m, b] = await Promise.all([
    list("SELECT id, slug, kind FROM places WHERE status = 'published' AND id IN (?)", ids('p')),
    list("SELECT id, slug FROM movies WHERE status = 'published' AND id IN (?)", ids('m')),
    list("SELECT id, slug FROM books WHERE status = 'published' AND id IN (?)", ids('b')),
  ])
  const find = (rs: unknown[], id: number) => (rs as { id: number; slug: string; kind?: string }[]).find((r) => r.id === id)
  const results = matches.map((x) => {
    const id = Number(x.id.slice(2)), score = Math.round(x.score * 1000) / 1000
    if (x.id.startsWith('p:')) { const r = find(p, id); return r && { type: 'place', slug: r.slug, kind: r.kind, score } }
    if (x.id.startsWith('m:')) { const r = find(m, id); return r && { type: 'movie', slug: r.slug, score } }
    const r = find(b, id); return r && { type: 'book', slug: r.slug, score }
  }).filter(Boolean)

  const out = json({ results }, { headers: { 'cache-control': 'public, max-age=600' } })
  ctx.waitUntil(caches.default.put(cacheKey, out.clone()))
  return out
}
