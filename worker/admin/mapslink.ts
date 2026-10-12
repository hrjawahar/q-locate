// Short Google Maps links (maps.app.goo.gl/…, goo.gl/maps/…) hide the coordinates behind redirects.
// Follow them (Google hosts only) and read the pin from the final address or the page.

const PATS = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  /[?&](?:q|ll|query|destination|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
  /\/maps\/search\/(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/,
]
const ok = (lat: number, lng: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)

export function coordsIn(text: string): [number, number] | null {
  let t = text
  try { t = decodeURIComponent(text) } catch { /* keep raw */ }
  for (const p of PATS) { const m = t.match(p); if (m && ok(+m[1], +m[2])) return [+m[1], +m[2]] }
  return null
}

const GOOGLE = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.|maps\.)?google\.[a-z.]+)$/i

export async function resolveMapsLink(input: string): Promise<{ lat?: number; lng?: number; error?: string }> {
  let url: URL
  try { url = new URL(input.trim()) } catch { return { error: 'not a link' } }
  for (let hop = 0; hop < 6; hop++) {
    if (!GOOGLE.test(url.hostname)) return { error: 'not a Google Maps link' }
    const c = coordsIn(url.href); if (c) return { lat: c[0], lng: c[1] }
    const res = await fetch(url.href, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (Q-Locate admin)', 'accept-language': 'en' }, signal: AbortSignal.timeout(8000) })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url); continue }
    // Final page: Google puts the map centre in the page (e.g. "center=11.66%2C92.74" or "@11.66,92.74").
    const html = (await res.text()).slice(0, 400_000)
    const p = coordsIn(html) ?? (() => { const m = html.match(/\[null,null,(-?\d+\.\d{3,}),(-?\d+\.\d{3,})\]/); return m && ok(+m[1], +m[2]) ? [+m[1], +m[2]] as [number, number] : null })()
    return p ? { lat: p[0], lng: p[1] } : { error: 'no pin in that link' }
  }
  return { error: 'too many redirects' }
}
