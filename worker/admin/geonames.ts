// GeoNames (CC BY 4.0): fills State / District / City, and backs up stations, stays and nearby
// places when Wikidata or OpenStreetMap have nothing. Needs a free GeoNames username (GEONAMES_USER).
import type { Suggestions, Hub } from './sources'

const BASE = 'https://secure.geonames.org'
interface GnRow { name: string; toponymName?: string; fcode?: string; lat: string; lng: string; distance?: string; adminName1?: string; adminName2?: string; countryName?: string }

async function gn(path: string, params: Record<string, string | string[]>, user: string): Promise<GnRow[]> {
  const u = new URL(`${BASE}/${path}`)
  for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) u.searchParams.append(k, x)
  u.searchParams.set('username', user)
  const res = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Q-Locate/1.0 (q-locate.hrjawahar.workers.dev)' } })
  if (!res.ok) throw new Error(`GeoNames HTTP ${res.status}`)
  const j = await res.json() as { geonames?: GnRow[]; status?: { message: string } }
  if (j.status) throw new Error(`GeoNames: ${j.status.message}`)
  return j.geonames ?? []
}

const dist = (r: GnRow) => Math.round(Number(r.distance ?? 0) * 10) / 10

export interface GnWhere { city: string | null; district: string | null; state: string | null; country: string | null }

/** Nearest town with its district and state. */
export async function gnWhere(lat: number, lng: number, user: string): Promise<GnWhere | null> {
  const [r] = await gn('findNearbyPlaceNameJSON', { lat: String(lat), lng: String(lng), cities: 'cities1000', style: 'FULL', maxRows: '1' }, user)
  if (!r) return null
  const district = r.adminName2?.replace(/\s+(district|taluk|tehsil)$/i, '') || null
  return { city: r.name || null, district, state: r.adminName1 || null, country: r.countryName || null }
}

// Feature codes we ask for. Churches and mosques are not requested.
const SPOTS = ['TMPL', 'SHRN', 'FLLS', 'LK', 'RSV', 'PK', 'HLL', 'MT', 'PKS', 'CAVE', 'BCH', 'DAM', 'PRK', 'GDN', 'MUS', 'HSTS', 'FT', 'CSTL', 'RUIN', 'MNMT', 'ZOO', 'RES', 'RESN', 'RESW']
const STAYS: Record<string, string> = { HTL: 'hotel', RHSE: 'budget_hotel' }
const KIND: Record<string, string> = { TMPL: 'temple', SHRN: 'temple', FLLS: 'waterfall', LK: 'lake', RSV: 'lake', PK: 'peak', HLL: 'peak', MT: 'peak', PKS: 'peak', CAVE: 'cave', BCH: 'beach', DAM: 'dam', RES: 'forest', RESN: 'forest', RESW: 'wildlife' }

export async function gnNearby(lat: number, lng: number, selfName: string, user: string): Promise<Suggestions & { air: Hub[]; rail: Hub[] }> {
  const ll = { lat: String(lat), lng: String(lng) }
  const [local, hubs] = await Promise.all([
    gn('findNearbyJSON', { ...ll, radius: '30', maxRows: '120', featureCode: [...SPOTS, ...Object.keys(STAYS), 'BUSTN'] }, user),
    gn('findNearbyJSON', { ...ll, radius: '150', maxRows: '20', featureCode: ['RSTN', 'AIRP'] }, user).catch(() => [] as GnRow[]),
  ])
  const self = selfName.toLowerCase()
  const uniq = (xs: GnRow[]) => xs.filter((x, i) => xs.findIndex((y) => y.name.toLowerCase() === x.name.toLowerCase()) === i)
  const by = (codes: string[]) => uniq(local.filter((r) => codes.includes(r.fcode ?? '')))
  const nearby = by(SPOTS).filter((r) => !(dist(r) < 0.5 && (self.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(self)))).slice(0, 8)
  return {
    transport: by(['BUSTN']).slice(0, 1).map((r) => ({ type: 'bus' as const, name: r.name, code: null, distance_km: dist(r) })),
    rail: uniq(hubs.filter((r) => r.fcode === 'RSTN')).slice(0, 2).map((r) => ({ type: 'rail' as const, name: r.name, code: null, distance_km: dist(r) })),
    air: uniq(hubs.filter((r) => r.fcode === 'AIRP')).slice(0, 1).map((r) => ({ type: 'air' as const, name: r.name, code: null, distance_km: dist(r) })),
    stays: by(Object.keys(STAYS)).slice(0, 6).map((r) => ({ name: r.name, type: STAYS[r.fcode!], distance_km: dist(r), phone: null, booking_url: null })),
    eateries: [],
    nearby: nearby.map((r) => ({ name: r.name, kind: KIND[r.fcode!] ?? 'attraction', distance_km: dist(r) })),
  }
}
