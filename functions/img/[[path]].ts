import { Env } from '../_lib/util'

// GET /img/<key> — serves photos from the R2 bucket, cached for a year (keys never change).
export const onRequestGet: PagesFunction<Env, 'path'> = async ({ env, params }) => {
  const parts = Array.isArray(params.path) ? params.path : [params.path]
  const key = parts.join('/')
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 })

  const obj = await env.PHOTOS.get(key)
  if (!obj) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
}
