import { json } from '../util'
import { img } from '../img'
import { AdminEnv, getAdmin } from './auth'
import * as api from './api'

// Admin app (q-locate-admin): the whole address is locked by Cloudflare Access;
// every /api/admin call also checks the admins table.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const { pathname } = url

    if (pathname === '/') return Response.redirect(new URL('/admin', url).toString(), 302)
    if (pathname.startsWith('/img/')) return img(env, decodeURIComponent(pathname.slice(5)))
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const { admin, email } = await getAdmin(request, env)
    if (pathname === '/api/admin/me') {
      return admin ? json(admin) : json({ error: email ? 'not_admin' : 'not_signed_in', email }, { status: 403 })
    }
    if (!admin) return json({ error: 'forbidden' }, { status: 403 })

    const m = request.method
    const body = async () => (await request.json().catch(() => ({}))) as Record<string, unknown>
    const idMatch = pathname.match(/^\/api\/admin\/places\/(\d+)(\/(status|verify))?$/)

    try {
      if (pathname === '/api/admin/lookups' && m === 'GET') return api.lookups(env)
      if (pathname === '/api/admin/places' && m === 'GET') return api.listPlaces(url, env, admin)
      if (pathname === '/api/admin/places' && m === 'POST') return api.savePlace(null, await body(), env, admin)
      if (pathname === '/api/admin/duplicates' && m === 'GET') return api.duplicates(url, env)
      if (pathname === '/api/admin/upload' && m === 'POST') return api.upload(request, env, admin)
      if (idMatch) {
        const id = Number(idMatch[1])
        if (!idMatch[2] && m === 'GET') return api.getPlace(id, env, admin)
        if (!idMatch[2] && m === 'PUT') return api.savePlace(id, await body(), env, admin)
        if (idMatch[3] === 'status' && m === 'POST') return api.setStatus(id, await body(), env, admin)
        if (idMatch[3] === 'verify' && m === 'POST') return api.markVerified(id, env, admin)
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
} satisfies ExportedHandler<AdminEnv>
