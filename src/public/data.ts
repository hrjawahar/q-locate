import MiniSearch from 'minisearch'
import { get, set, del, keys } from 'idb-keyval'

export type Kind = 'vacation' | 'spiritual'
export interface IndexPlace {
  slug: string; kind: Kind; name: string; alt_names: string; country: string; state: string; district_city: string; city: string
  tags: string; deity: string; categories: string[]; circuits: string[]; best_months: number[]
  typical_visit: string | null; access_effort: string | null; thumb: string | null; summary: string; hours: { open: string; close: string }[]
}
export interface Meta { categories: { kind: Kind; slug: string; name: string }[]; circuits: { slug: string; name: string; total_count: number | null }[] }
export type Place = Record<string, any>

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(String(r.status))
  return r.json() as Promise<T>
}

let indexPromise: Promise<IndexPlace[]> | null = null
/** All published places (small list for on-device search). Falls back to the last copy when offline. */
export function loadIndex(): Promise<IndexPlace[]> {
  indexPromise ??= getJson<{ places: IndexPlace[] }>('/api/index.json')
    .then(async (d) => { await set('index', d.places).catch(() => {}); return d.places })
    .catch(async () => ((await get('index').catch(() => null)) as IndexPlace[] | undefined) ?? [])
  return indexPromise
}

let metaPromise: Promise<Meta> | null = null
export function loadMeta(): Promise<Meta> {
  metaPromise ??= getJson<Meta>('/api/meta')
    .then(async (d) => { await set('meta', d).catch(() => {}); return d })
    .catch(async () => ((await get('meta').catch(() => null)) as Meta | undefined) ?? { categories: [], circuits: [] })
  return metaPromise
}

export async function loadPlace(slug: string): Promise<Place | null> {
  try {
    const p = await getJson<Place>(`/api/places/${encodeURIComponent(slug)}`)
    await set(`place:${slug}`, p).catch(() => {})
    return p
  } catch {
    return ((await get(`saved:${slug}`).catch(() => null)) ?? (await get(`place:${slug}`).catch(() => null)) ?? null) as Place | null
  }
}

export function makeSearch(places: IndexPlace[]) {
  const ms = new MiniSearch<IndexPlace>({
    idField: 'slug',
    fields: ['name', 'alt_names', 'deity', 'city', 'district_city', 'state', 'country', 'tags'],
    storeFields: ['slug'],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 4, alt_names: 3, deity: 3, city: 2, district_city: 2, state: 2 } },
  })
  ms.addAll(places)
  return (q: string) => ms.search(q).map((r) => r.id as string)
}

// ---------- Saved places (kept on the device, work offline) ----------
export async function savedSlugs(): Promise<string[]> {
  return ((await keys().catch(() => [])) as string[]).filter((k) => typeof k === 'string' && k.startsWith('saved:')).map((k) => k.slice(6))
}
export async function savedPlaces(): Promise<Place[]> {
  const slugs = await savedSlugs()
  return (await Promise.all(slugs.map((s) => get(`saved:${s}`).catch(() => null)))).filter(Boolean) as Place[]
}
export const isSaved = async (slug: string) => !!(await get(`saved:${slug}`).catch(() => null))
export const savePlace = (p: Place) => set(`saved:${p.slug}`, p)
export const unsavePlace = (slug: string) => del(`saved:${slug}`)

// ---------- Helpers ----------
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const ACCESS: Record<string, string> = { drive_up: 'Drive up to the spot', short_walk: 'Short walk', steps_climb: 'Steps / steep climb', trek: 'Trek / long hike' }
export const VISIT: Record<string, string> = { few_hours: 'A few hours', '1_day': '1 day', '2_3_days': '2–3 days', week_plus: 'A week or more' }
export const STAY: Record<string, string> = { hostel: 'Hostel', dorm: 'Dormitory', homestay: 'Homestay', budget_hotel: 'Budget hotel', hotel: 'Hotel', resort: 'Resort', dharmashala: 'Dharmashala' }
export const AMENITY: Record<string, string> = { parking: 'Parking', food: 'Food nearby', restroom: 'Restrooms', wheelchair: 'Wheelchair access', atm: 'ATM nearby', drinking_water: 'Drinking water', cloakroom: 'Cloakroom / footwear stand', guide: 'Guides available' }
export const km = (d: number | null | undefined) => (d == null ? '' : d < 1 ? `about ${Math.round(d * 1000 / 50) * 50} m` : `about ${d < 10 ? d.toFixed(1) : Math.round(d)} km`)
export const where = (p: { city?: string; district_city?: string; state?: string; country?: string }) =>
  [p.city, p.district_city, p.state, p.country && p.country !== 'India' ? p.country : ''].filter((x, i, a) => x && a.indexOf(x) === i).join(', ')
export const placeUrl = (p: { kind: Kind; slug: string }) => `/${p.kind === 'spiritual' ? 's' : 'v'}/${p.slug}`

/** "Open now" for Indian temples, using India time. */
export function openNow(hours: { open: string; close: string }[], country: string): boolean | null {
  if (!hours?.length || (country && country !== 'India')) return null
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  return hours.some((h) => h.open && h.close && now >= h.open && now < h.close)
}
export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}
