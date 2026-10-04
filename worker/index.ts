import { Env, json } from './util'
import { indexJson } from './index-json'
import { place } from './place'
import { search } from './search'
import { img } from './img'
import { moviesJson } from './movies'
import { booksJson } from './books'

// Entry point: /api/* and /img/* run here; everything else is the React app (dist/).
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)

    if (pathname.startsWith('/api/') || pathname.startsWith('/img/')) {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405 })
      if (pathname === '/api/index.json') return indexJson(request, env, ctx)
      if (pathname === '/api/search') return search(request, env)
      if (pathname === '/api/movies.json') return moviesJson(env)
      if (pathname === '/api/books.json') return booksJson(env)
      if (pathname === '/api/meta') {
        const [c, ci] = await env.DB.batch([
          env.DB.prepare('SELECT kind, slug, name FROM categories ORDER BY kind, sort'),
          env.DB.prepare('SELECT slug, name, total_count FROM circuits ORDER BY name'),
        ])
        return json({ categories: c.results, circuits: ci.results }, { headers: { 'cache-control': 'public, max-age=3600' } })
      }
      const m = pathname.match(/^\/api\/places\/([a-z0-9-]+)$/)
      if (m) return place(env, m[1])
      if (pathname.startsWith('/img/')) return img(env, decodeURIComponent(pathname.slice(5)))
      return json({ error: 'not_found' }, { status: 404 })
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
