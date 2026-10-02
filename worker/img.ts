import { Env } from './util'

// GET /img/<key> — serves photos from the R2 bucket, cached for a year (keys never change).
export const img = async (env: Env, key: string) => {
  if (!key || key.includes('..') || key.startsWith('admin-data/')) return new Response('Not found', { status: 404 })

  const obj = await env.PHOTOS.get(key)
  if (!obj) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(obj.body, { headers })
}
