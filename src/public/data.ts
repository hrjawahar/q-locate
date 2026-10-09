import MiniSearch from 'minisearch'
import { get, set, del, keys } from 'idb-keyval'
import { processTerm, expand } from './searchkit'

export type Kind = 'vacation' | 'spiritual'
export interface IndexPlace {
  slug: string; kind: Kind; name: string; alt_names: string; country: string; state: string; district_city: string; city: string
  tags: string; deity: string; categories: string[]; circuits: string[]; best_months: number[]
  typical_visit: string | null; access_effort: string | null; thumb: string | null; summary: string; hours: { open: string; close: string }[]
  text?: string
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
    fields: ['name', 'alt_names', 'deity', 'city', 'district_city', 'state', 'country', 'tags', 'text'],
    storeFields: ['slug'],
    processTerm,
    searchOptions: { prefix: true, fuzzy: 0.15, boost: { name: 4, alt_names: 3, deity: 3, city: 2, district_city: 2, state: 2, tags: 2, text: 1 } },
  })
  ms.addAll(places)
  return (q: string) => ms.search(expand(q)).map((r) => r.id as string)
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

// ---------- Movie Picks (movies) ----------
export interface Movie {
  slug: string; title: string; year: number | null; country: string | null; language: string | null; subtitles: string | null
  genres: string[]; doc_topic: string | null; runtime_min: number | null; pitch: string | null; family_friendly: boolean | null
  published_at: string | null; recs: { handle: string | null; url: string | null }[]
}
let moviesPromise: Promise<Movie[]> | null = null
export function loadMovies(): Promise<Movie[]> {
  moviesPromise ??= getJson<{ movies: Movie[] }>('/api/movies.json')
    .then(async (d) => { await set('movies', d.movies).catch(() => {}); return d.movies })
    .catch(async () => ((await get('movies').catch(() => null)) as Movie[] | undefined) ?? [])
  return moviesPromise
}
export const runtime = (m: number | null) => (m ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : '')

// ---------- Book Picks ----------
export interface Book {
  slug: string; title: string; author: string | null; year: number | null; language: string | null; fiction: boolean | null
  genres: string[]; topic: string | null; pages: number | null; pitch: string | null; published_at: string | null
  recs: { handle: string | null; url: string | null }[]
}
let booksPromise: Promise<Book[]> | null = null
export function loadBooks(): Promise<Book[]> {
  booksPromise ??= getJson<{ books: Book[] }>('/api/books.json')
    .then(async (d) => { await set('books', d.books).catch(() => {}); return d.books })
    .catch(async () => ((await get('books').catch(() => null)) as Book[] | undefined) ?? [])
  return booksPromise
}

// ---------- Festivals ----------
export interface Festival {
  slug: string; name: string; alt_names: string | null; country: string | null; state: string | null; towns: string | null
  kind: 'religious' | 'cultural' | 'both' | null; months: number[]; next_start: string | null; next_end: string | null
  dates_checked_on: string | null; summary: string | null; tips: string | null; places: { slug: string; kind: string; name: string }[]
}
let festivalsPromise: Promise<Festival[]> | null = null
export function loadFestivals(): Promise<Festival[]> {
  festivalsPromise ??= getJson<{ festivals: Festival[] }>('/api/festivals.json')
    .then(async (d) => { await set('festivals', d.festivals).catch(() => {}); return d.festivals })
    .catch(async () => ((await get('festivals').catch(() => null)) as Festival[] | undefined) ?? [])
  return festivalsPromise
}
const todayIso = () => new Date().toISOString().slice(0, 10)
const fmtDay = (d: string, withYear = true) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
/** Upcoming dates if known and not past, else null. */
export const festivalDates = (f: Festival) => (f.next_start && (f.next_end ?? f.next_start) >= todayIso()
  ? (f.next_end && f.next_end !== f.next_start
    ? (f.next_start.slice(0, 7) === f.next_end.slice(0, 7) ? `${Number(f.next_start.slice(8, 10))} – ${fmtDay(f.next_end)}` : `${fmtDay(f.next_start, false)} – ${fmtDay(f.next_end)}`)
    : fmtDay(f.next_start)) : null)
/** "Usually in October" / "Usually Oct – Nov". */
export const festivalMonths = (f: Festival) => (f.months.length ? `Usually in ${f.months.map((m) => MONTHS[m - 1]).join(', ')}` : '')
/** Does the festival fall in this month (1-12)? Uses confirmed dates when there are any, else the usual months. */
export function festivalInMonth(f: Festival, month: number) {
  const d = festivalDates(f) ? [f.next_start!, f.next_end ?? f.next_start!] : null
  if (d) { const a = Number(d[0].slice(5, 7)), b = Number(d[1].slice(5, 7)); return a <= b ? month >= a && month <= b : month >= a || month <= b }
  return f.months.includes(month)
}
/** Sort key: soonest first (confirmed dates, then usual month from now). */
export function festivalOrder(f: Festival) {
  const now = new Date(), m = now.getMonth() + 1
  if (festivalDates(f)) return (new Date(`${f.next_start}T00:00:00`).getTime() - now.getTime()) / 864e5
  const ahead = f.months.map((x) => (x - m + 12) % 12)
  return ahead.length ? Math.min(...ahead) * 30 + 15 : 9999
}

// ---------- Local Makers ----------
export interface Maker {
  slug: string; name: string; products: string | null; category: string | null; village: string | null; district: string | null
  state: string | null; country: string | null; phone: string | null; about: string | null
}
let makersPromise: Promise<Maker[]> | null = null
export function loadMakers(): Promise<Maker[]> {
  makersPromise ??= getJson<{ makers: Maker[] }>('/api/makers.json')
    .then(async (d) => { await set('makers', d.makers).catch(() => {}); return d.makers })
    .catch(async () => ((await get('makers').catch(() => null)) as Maker[] | undefined) ?? [])
  return makersPromise
}
/** Digits for tel: and wa.me links (adds India's +91 to 10-digit numbers). */
export const phoneDigits = (p: string) => { const d = p.replace(/[^\d]/g, ''); return d.length === 10 ? `91${d}` : d.replace(/^0+/, '') }
