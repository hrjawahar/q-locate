import { useEffect, useState } from 'react'

export interface SemHit { type: 'place' | 'movie' | 'book' | 'festival' | 'maker'; slug: string; kind?: string; score: number }
const cache = new Map<string, SemHit[]>()

/** Is the device online? Updates live. */
export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])
  return online
}

/** "Closest matches" by meaning for a search (online only; quietly empty offline or on error). */
export function useSemantic(q: string): SemHit[] {
  const [hits, setHits] = useState<SemHit[]>([])
  const key = q.replace(/\s+/g, ' ').trim().toLowerCase()
  useEffect(() => {
    if (key.length < 3 || !navigator.onLine) { setHits([]); return }
    if (cache.has(key)) { setHits(cache.get(key)!); return }
    let stop = false
    const t = setTimeout(() => {
      fetch(`/api/semantic?q=${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results?: SemHit[] }) => { const xs = d.results ?? []; cache.set(key, xs); if (!stop) setHits(xs) })
        .catch(() => { if (!stop) setHits([]) })
    }, 450)
    return () => { stop = true; clearTimeout(t) }
  }, [key])
  return hits
}
