export interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  ASSETS: Fetcher
  AI?: Ai
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  })

export const parseJson = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string' || !v) return fallback
  try { return JSON.parse(v) as T } catch { return fallback }
}

export const splitList = (v: unknown): string[] =>
  typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []

export const photoUrls = (key: unknown) =>
  typeof key === 'string' && key ? { full: `/img/${key}-1200.webp`, thumb: `/img/${key}-400.webp` } : null
