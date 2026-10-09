import { json } from '../util'
import { img } from '../img'
import { AdminEnv, getAdmin, lastAuthProblem } from './auth'
import * as api from './api'
import * as imp from './importer'
import * as tracker from './tracker'
import * as movies from './movies'
import * as books from './books'
import * as festivals from './festivals'
import * as makers from './makers'
import * as vectors from './vectors'

// Admin app (q-locate-admin): the whole address is locked by Cloudflare Access;
// every /api/admin call also checks the admins table.
type Env = AdminEnv & { ANTHROPIC_API_KEY?: string; AI_MODEL?: string; IMPORT_BATCH?: string; GEONAMES_USER?: string }

export default {
  // Every minute: import a few queued places in the background (safe to close the browser).
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(imp.processNext(env, Math.max(1, Number(env.IMPORT_BATCH) || 2)))
    // Keep meaning-search fingerprints in step with what is published.
    ctx.waitUntil(vectors.sync(env).catch((e) => console.log('vector sync', (e as Error).message)))
    // Festival dates: "Refresh all" runs (and the automatic run on the 1st of each month).
    ctx.waitUntil(festivals.processRefresh(env).catch((e) => console.log('festival refresh', (e as Error).message)))
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const { pathname } = url

    if (pathname === '/') return Response.redirect(new URL('/admin', url).toString(), 302)
    if (pathname.startsWith('/img/')) return img(env, decodeURIComponent(pathname.slice(5)))
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const { admin, email } = await getAdmin(request, env)
    if (pathname === '/api/admin/me') {
      return admin ? json(admin) : json({ error: email ? 'not_admin' : 'not_signed_in', email, detail: email ? undefined : lastAuthProblem }, { status: 403 })
    }
    if (!admin) return json({ error: 'forbidden' }, { status: 403 })

    const m = request.method
    const body = async () => (await request.json().catch(() => ({}))) as Record<string, unknown>
    const idMatch = pathname.match(/^\/api\/admin\/places\/(\d+)(\/(status|verify|enrich))?$/)

    try {
      if (pathname === '/api/admin/lookups' && m === 'GET') return api.lookups(env)
      if (pathname === '/api/admin/places' && m === 'GET') return api.listPlaces(url, env, admin)
      if (pathname === '/api/admin/places' && m === 'POST') return api.savePlace(null, await body(), env, admin)
      if (pathname === '/api/admin/duplicates' && m === 'GET') return api.duplicates(url, env)
      if (pathname === '/api/admin/upload' && m === 'POST') return api.upload(request, env, admin)
      if (pathname === '/api/admin/places/bulk' && m === 'POST') return api.bulkStatus(await body(), env, admin)
      if (pathname === '/api/admin/wikidata/search' && m === 'GET') return imp.wikidataSearch(url)
      if (pathname === '/api/admin/search/status' && m === 'GET') return vectors.status(env)
      if (pathname === '/api/admin/search/rebuild' && m === 'POST' && admin.role === 'owner') return vectors.rebuild(env)
      if (pathname === '/api/admin/search/sync' && m === 'POST' && admin.role !== 'editor') return json({ done: await vectors.sync(env) })
      if (pathname.startsWith('/api/admin/makers')) {
        if (admin.scope !== 'all') return json({ error: 'Vocal for Local needs an admin with access to all sections' }, { status: 403 })
        const km = pathname.match(/^\/api\/admin\/makers\/(\d+)(\/(status))?$/)
        if (pathname === '/api/admin/makers' && m === 'GET') return makers.list(url, env)
        if (pathname === '/api/admin/makers' && m === 'POST') return makers.save(null, await body(), env, admin)
        if (km && !km[2] && m === 'GET') return makers.get(Number(km[1]), env)
        if (km && !km[2] && m === 'PUT') return makers.save(Number(km[1]), await body(), env, admin)
        if (km && !km[2] && m === 'DELETE') return makers.remove(Number(km[1]), env, admin)
        if (km && km[3] === 'status' && m === 'POST') return makers.setStatus(Number(km[1]), await body(), env, admin)
      }
      if (pathname.startsWith('/api/admin/festivals')) {
        if (admin.scope !== 'all') return json({ error: 'Festivals needs an admin with access to all sections' }, { status: 403 })
        const fm = pathname.match(/^\/api\/admin\/festivals\/(\d+)(\/(status|dates))?$/)
        if (pathname === '/api/admin/festivals' && m === 'GET') return festivals.list(url, env)
        if (pathname === '/api/admin/festivals' && m === 'POST') return festivals.save(null, await body(), env, admin)
        if (pathname === '/api/admin/festivals/fill' && m === 'POST') return festivals.fill(await body(), env)
        if (pathname === '/api/admin/festivals/refresh' && m === 'GET') return festivals.refreshStatus(env)
        if (pathname === '/api/admin/festivals/refresh' && m === 'POST') return festivals.refreshAll(env, admin)
        if (fm && !fm[2] && m === 'GET') return festivals.get(Number(fm[1]), env)
        if (fm && !fm[2] && m === 'PUT') return festivals.save(Number(fm[1]), await body(), env, admin)
        if (fm && !fm[2] && m === 'DELETE') return festivals.remove(Number(fm[1]), env, admin)
        if (fm && fm[3] === 'status' && m === 'POST') return festivals.setStatus(Number(fm[1]), await body(), env, admin)
        if (fm && fm[3] === 'dates' && m === 'POST') return festivals.refreshDates(Number(fm[1]), env, admin)
      }
      if (pathname.startsWith('/api/admin/books')) {
        if (admin.scope !== 'all') return json({ error: 'Book Picks needs an admin with access to all sections' }, { status: 403 })
        const bm = pathname.match(/^\/api\/admin\/books\/(\d+)(\/(status|recs))?$/)
        if (pathname === '/api/admin/books' && m === 'GET') return books.list(url, env)
        if (pathname === '/api/admin/books' && m === 'POST') return books.save(null, await body(), env, admin)
        if (pathname === '/api/admin/books/fill' && m === 'POST') return books.fill(await body(), env)
        if (bm && !bm[2] && m === 'GET') return books.get(Number(bm[1]), env)
        if (bm && !bm[2] && m === 'PUT') return books.save(Number(bm[1]), await body(), env, admin)
        if (bm && !bm[2] && m === 'DELETE') return books.remove(Number(bm[1]), env, admin)
        if (bm && bm[3] === 'status' && m === 'POST') return books.setStatus(Number(bm[1]), await body(), env, admin)
        if (bm && bm[3] === 'recs' && m === 'POST') return books.addRec(Number(bm[1]), await body(), env, admin)
      }
      if (pathname.startsWith('/api/admin/movies')) {
        if (admin.scope !== 'all') return json({ error: 'Movie Picks needs an admin with access to all sections' }, { status: 403 })
        const mm = pathname.match(/^\/api\/admin\/movies\/(\d+)(\/(status|recs))?$/)
        if (pathname === '/api/admin/movies' && m === 'GET') return movies.list(url, env)
        if (pathname === '/api/admin/movies' && m === 'POST') return movies.save(null, await body(), env, admin)
        if (pathname === '/api/admin/movies/fill' && m === 'POST') return movies.fill(await body(), env)
        if (mm && !mm[2] && m === 'GET') return movies.get(Number(mm[1]), env)
        if (mm && !mm[2] && m === 'PUT') return movies.save(Number(mm[1]), await body(), env, admin)
        if (mm && !mm[2] && m === 'DELETE') return movies.remove(Number(mm[1]), env, admin)
        if (mm && mm[3] === 'status' && m === 'POST') return movies.setStatus(Number(mm[1]), await body(), env, admin)
        if (mm && mm[3] === 'recs' && m === 'POST') return movies.addRec(Number(mm[1]), await body(), env, admin)
      }
      if (pathname.startsWith('/api/admin/tracker')) {
        if (admin.role === 'editor' || (admin.scope !== 'all' && admin.scope !== 'spiritual')) return json({ error: 'Not available for your role' }, { status: 403 })
        if (pathname === '/api/admin/tracker' && m === 'GET') return tracker.get(env)
        if (pathname === '/api/admin/tracker/refresh' && m === 'POST') return tracker.refresh(await body(), env)
        if (pathname === '/api/admin/tracker/skip' && m === 'POST') return tracker.skip(await body(), env)
      }
      if (pathname.startsWith('/api/admin/import/')) {
        if (admin.role === 'editor') return json({ error: 'Only a publisher or owner can import' }, { status: 403 })
        const action = pathname.slice('/api/admin/import/'.length)
        if (action === 'presets' && m === 'GET') return imp.listPresets()
        if (action === 'preview' && m === 'POST') return imp.preview(await body(), env)
        if (action === 'queue' && m === 'POST') return imp.enqueue(await body(), env, admin)
        if (action === 'status' && m === 'GET') return imp.status(env)
        if (action === 'check' && m === 'GET') return imp.checkSources(env)
        if (action === 'run' && m === 'POST') { await imp.processNext(env, 1); return imp.status(env) }
        if (action === 'retry' && m === 'POST') return imp.retryErrors(env)
        if (action === 'clear' && m === 'POST') return imp.clearPending(env)
        if (action === 'refill' && m === 'POST') return imp.enqueueRefill(await body(), env, admin)
      }
      if (idMatch) {
        const id = Number(idMatch[1])
        if (!idMatch[2] && m === 'GET') return api.getPlace(id, env, admin)
        if (!idMatch[2] && m === 'PUT') return api.savePlace(id, await body(), env, admin)
        if (idMatch[3] === 'status' && m === 'POST') return api.setStatus(id, await body(), env, admin)
        if (idMatch[3] === 'verify' && m === 'POST') return api.markVerified(id, env, admin)
        if (idMatch[3] === 'enrich' && m === 'POST') return imp.enrichPlace(id, await body(), env, admin)
      }
      if (pathname === '/api/admin/activity' && m === 'GET' && admin.role !== 'editor') return api.activity(env)
      if (pathname.startsWith('/api/admin/users')) {
        if (admin.role !== 'owner') return json({ error: 'Owner only' }, { status: 403 })
        if (m === 'GET') return api.listUsers(env)
        if (m === 'POST') return api.saveUser(await body(), env, admin)
      }
      return json({ error: 'not_found' }, { status: 404 })
    } catch (e) {
      console.error(e)
      return json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }
  },
} satisfies ExportedHandler<Env>
