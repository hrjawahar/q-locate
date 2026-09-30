// Fetchers for open, reusable sources: Wikidata (CC0), Wikipedia (reference text only),
// Wikimedia Commons (photos with credit), OpenStreetMap via Overpass (ODbL, credited).

const UA = 'Q-Locate/1.0 (https://q-locate.hrjawahar.workers.dev)'
const WD_SPARQL = 'https://query.wikidata.org/sparql'
const WD_API = 'https://www.wikidata.org/w/api.php'

export const INDIA_STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal']

const sparqlStr = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const qid = (s: string) => { if (!/^Q\d+$/.test(s)) throw new Error(`Bad Wikidata id ${s}`); return s }

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'user-agent': UA, accept: 'application/json', ...(init.headers || {}) } })
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
  return res.json() as Promise<T>
}

type Binding = Record<string, { value: string } | undefined>
export async function sparql(query: string): Promise<Binding[]> {
  const data = await getJson<{ results: { bindings: Binding[] } }>(WD_SPARQL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }).toString(),
  })
  return data.results.bindings
}

export interface WdHit { id: string; label: string; description: string }
export async function wdSearch(q: string, limit = 5): Promise<WdHit[]> {
  const u = new URL(WD_API)
  u.search = new URLSearchParams({ action: 'wbsearchentities', search: q, language: 'en', uselang: 'en', type: 'item', limit: String(limit), format: 'json', origin: '*' }).toString()
  const d = await getJson<{ search?: { id: string; label?: string; description?: string }[] }>(u.toString())
  return (d.search ?? []).map((s) => ({ id: s.id, label: s.label ?? s.id, description: s.description ?? '' }))
}

/** Resolve a type name such as "waterfall" to a Wikidata class id. */
export async function resolveType(label: string): Promise<WdHit | null> {
  const hits = await wdSearch(label, 7)
  return hits.find((h) => h.label.toLowerCase() === label.toLowerCase()) ?? hits[0] ?? null
}

export interface ListItem { id: string; label: string; description: string }
export async function listByType(opts: { typeId: string; countryId: string | null; excludeIndia?: boolean; region?: string; notableOnly: boolean }): Promise<ListItem[]> {
  const where = [
    `?item wdt:P31 wd:${qid(opts.typeId)} .`,
    opts.countryId ? `?item wdt:P17 wd:${qid(opts.countryId)} .` : '',
    opts.excludeIndia ? 'FILTER NOT EXISTS { ?item wdt:P17 wd:Q668 }' : '',
    opts.region ? `?item wdt:P131+ ?rg . ?rg rdfs:label ${sparqlStr(opts.region)}@en .` : '',
    opts.notableOnly ? '?art schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .' : '',
  ].join('\n')
  const rows = await sparql(`SELECT DISTINCT ?item ?itemLabel ?itemDescription WHERE {
${where}
SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 1000`)
  return rows.map((r) => ({
    id: (r.item?.value ?? '').split('/').pop() ?? '',
    label: r.itemLabel?.value ?? '',
    description: r.itemDescription?.value ?? '',
  })).filter((r) => /^Q\d+$/.test(r.id) && r.label && !/^Q\d+$/.test(r.label))
}

export interface WdPlace {
  id: string; name: string; description: string; altNames: string[]
  lat: number | null; lng: number | null; country: string | null
  state: string | null; district: string | null; city: string | null
  image: string | null; website: string | null; wikiTitle: string | null; deity: string | null
}

export function parsePoint(v?: string): [number, number] | null {
  const m = v?.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/)
  return m ? [Number(m[2]), Number(m[1])] : null
}

/** Work out state / district / city from the administrative chain (nearest first). */
export function placeAdmin(chain: string[], country: string | null) {
  const c = chain.filter(Boolean)
  if (country === 'India') {
    const si = c.findIndex((x) => INDIA_STATES.includes(x))
    const state = si >= 0 ? c[si] : null
    const below = si >= 0 ? c.slice(0, si) : c
    const district = below.find((x) => /district/i.test(x)) ?? (below.length > 1 ? below[below.length - 1] : null)
    const city = below[0] && below[0] !== district ? below[0] : null
    return { state, district: district?.replace(/\s+district$/i, '') ?? null, city }
  }
  const top = c.filter((x) => x !== country)
  return { state: top.length ? top[top.length - 1] : null, district: null, city: top.length > 1 ? top[0] : null }
}

export async function wdPlace(id: string): Promise<WdPlace> {
  const rows = await sparql(`SELECT ?item (SAMPLE(?l) AS ?label) (SAMPLE(?d) AS ?desc) (SAMPLE(?c) AS ?coord) (SAMPLE(?cl) AS ?country)
 (SAMPLE(?img) AS ?image) (SAMPLE(?web) AS ?website) (SAMPLE(?t) AS ?wiki) (SAMPLE(?dl) AS ?deity)
 (SAMPLE(?a1l) AS ?adm1) (SAMPLE(?a2l) AS ?adm2) (SAMPLE(?a3l) AS ?adm3) (SAMPLE(?a4l) AS ?adm4)
 (GROUP_CONCAT(DISTINCT ?al; separator="|") AS ?aliases) (SAMPLE(?ta) AS ?taLabel) (SAMPLE(?hi) AS ?hiLabel) WHERE {
 VALUES ?item { wd:${qid(id)} }
 OPTIONAL { ?item rdfs:label ?l FILTER(lang(?l)="en") }
 OPTIONAL { ?item schema:description ?d FILTER(lang(?d)="en") }
 OPTIONAL { ?item wdt:P625 ?c }
 OPTIONAL { ?item wdt:P17 ?co . ?co rdfs:label ?cl FILTER(lang(?cl)="en") }
 OPTIONAL { ?item wdt:P18 ?img }
 OPTIONAL { ?item wdt:P856 ?web }
 OPTIONAL { ?art schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t }
 OPTIONAL { ?item wdt:P825 ?de . ?de rdfs:label ?dl FILTER(lang(?dl)="en") }
 OPTIONAL { ?item wdt:P131 ?a1 . ?a1 rdfs:label ?a1l FILTER(lang(?a1l)="en")
  OPTIONAL { ?a1 wdt:P131 ?a2 . ?a2 rdfs:label ?a2l FILTER(lang(?a2l)="en")
   OPTIONAL { ?a2 wdt:P131 ?a3 . ?a3 rdfs:label ?a3l FILTER(lang(?a3l)="en")
    OPTIONAL { ?a3 wdt:P131 ?a4 . ?a4 rdfs:label ?a4l FILTER(lang(?a4l)="en") } } } }
 OPTIONAL { ?item skos:altLabel ?al FILTER(lang(?al)="en") }
 OPTIONAL { ?item rdfs:label ?ta FILTER(lang(?ta)="ta") }
 OPTIONAL { ?item rdfs:label ?hi FILTER(lang(?hi)="hi") }
} GROUP BY ?item`)
  const r = rows[0] ?? {}
  const v = (k: string) => r[k]?.value || null
  const pt = parsePoint(v('coord') ?? undefined)
  const country = v('country')
  const adm = placeAdmin([v('adm1'), v('adm2'), v('adm3'), v('adm4')].filter((x): x is string => !!x), country)
  const name = v('label') ?? id
  const alt = [...(v('aliases')?.split('|') ?? []), v('taLabel'), v('hiLabel')]
    .filter((x): x is string => !!x && x !== name)
  return {
    id, name, description: v('desc') ?? '', altNames: [...new Set(alt)].slice(0, 8),
    lat: pt?.[0] ?? null, lng: pt?.[1] ?? null, country, ...adm,
    image: v('image'), website: v('website'), wikiTitle: v('wiki'), deity: v('deity'),
  }
}

export async function wikiExtract(title: string): Promise<{ text: string; url: string } | null> {
  try {
    const d = await getJson<{ extract?: string; content_urls?: { desktop?: { page?: string } } }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
    return d.extract ? { text: d.extract.slice(0, 2500), url: d.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` } : null
  } catch { return null }
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()

/** Look up a Commons photo: two thumbnail URLs plus the author and licence for the credit line. */
export async function commonsPhoto(filePathUrl: string) {
  const file = decodeURIComponent(filePathUrl.split('/').pop() ?? '')
  if (!file) return null
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  u.search = new URLSearchParams({ action: 'query', format: 'json', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960', origin: '*' }).toString()
  const d = await getJson<{ query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }> } }>(u.toString())
  const info = Object.values(d.query?.pages ?? {})[0]?.imageinfo?.[0]
  if (!info?.thumburl) return null
  const meta = info.extmetadata ?? {}
  const artist = stripHtml(meta.Artist?.value ?? '') || 'Unknown author'
  const license = stripHtml(meta.LicenseShortName?.value ?? '')
  return {
    large: info.thumburl,
    small: info.thumburl.replace(/\/960px-/, '/330px-'),
    page: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
    credit: `Photo: ${artist.slice(0, 80)}${license ? `, ${license}` : ''}, via Wikimedia Commons`,
  }
}

export async function download(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) return null
  const type = res.headers.get('content-type') ?? 'image/jpeg'
  if (!type.startsWith('image/')) return null
  return { body: await res.arrayBuffer(), type }
}

// ---------- OpenStreetMap ----------

export const km = (a: [number, number], b: [number, number]) => {
  const R = 6371, rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10
}

export interface OsmEl { tags: Record<string, string>; lat: number; lon: number }
export async function overpass(lat: number, lng: number): Promise<OsmEl[]> {
  const a = (r: number) => `(around:${r},${lat},${lng})`
  const q = `[out:json][timeout:25];
nwr${a(30000)}[railway=station][name]; out center tags 15;
nwr${a(20000)}[amenity=bus_station][name]; out center tags 8;
nwr${a(150000)}[aeroway=aerodrome][iata]; out center tags 8;
nwr${a(3000)}[tourism~"^(hostel|guest_house|hotel|motel|apartment)$"][name]; out center tags 25;
nwr${a(1500)}[amenity~"^(restaurant|cafe|fast_food)$"][name]; out center tags 25;
nwr${a(10000)}[amenity=place_of_worship][religion~"^(hindu|jain|sikh|buddhist)$"][name]; out center tags 25;
nwr${a(15000)}[tourism~"^(attraction|viewpoint)$"][name]; out center tags 20;
nwr${a(15000)}[natural~"^(waterfall|peak|beach)$"][name]; out center tags 15;`
  type Resp = { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]; remark?: string }
  // Public Overpass servers often refuse cloud traffic or time out, so try mirrors in turn.
  const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
  const problems: string[] = []
  let d: Resp | null = null
  for (const server of servers) {
    try {
      const r = await getJson<Resp>(server, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: q }).toString() })
      if (r.remark && /timed out|runtime error/i.test(r.remark) && !(r.elements ?? []).length) { problems.push(`${new URL(server).hostname}: ${r.remark.slice(0, 60)}`); continue }
      d = r; break
    } catch (e) { problems.push((e as Error).message) }
  }
  if (!d) throw new Error(`OpenStreetMap servers unavailable (${problems.join('; ')})`)
  return (d.elements ?? []).flatMap((e) => {
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon
    return la != null && lo != null && e.tags ? [{ tags: e.tags, lat: la, lon: lo }] : []
  })
}

const phoneOf = (t: Record<string, string>) => (t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? '').split(';')[0].trim() || null
const webOf = (t: Record<string, string>) => t.website ?? t['contact:website'] ?? null
const nameOf = (t: Record<string, string>) => t['name:en'] ?? t.name

export interface Suggestions {
  transport: { type: 'rail' | 'bus' | 'air'; name: string; code: string | null; distance_km: number }[]
  stays: { name: string; type: string; distance_km: number; phone: string | null; booking_url: string | null }[]
  eateries: { name: string; pure_veg: number; distance_km: number; phone: string | null }[]
  nearby: { name: string; kind: string; distance_km: number }[]
}

/** Turn raw OSM elements into the nearest few of each kind. */
export function suggestions(els: OsmEl[], origin: [number, number], selfName: string): Suggestions {
  const withD = els.map((e) => ({ ...e, d: km(origin, [e.lat, e.lon]), n: nameOf(e.tags) })).filter((e) => e.n)
  const nearest = <T extends { d: number }>(xs: T[], n: number) => xs.sort((x, y) => x.d - y.d).slice(0, n)
  const uniq = <T extends { n: string }>(xs: T[]) => xs.filter((x, i) => xs.findIndex((y) => y.n.toLowerCase() === x.n.toLowerCase()) === i)
  const t = (e: OsmEl) => e.tags

  const rail = nearest(uniq(withD.filter((e) => t(e).railway === 'station' && !/^(subway|light_rail|monorail|tram)$/.test(t(e).station ?? ''))), 2)
  const bus = nearest(uniq(withD.filter((e) => t(e).amenity === 'bus_station')), 1)
  const air = nearest(uniq(withD.filter((e) => t(e).aeroway === 'aerodrome' && t(e).iata)), 1)
  const stayType: Record<string, string> = { hostel: 'hostel', guest_house: 'homestay', apartment: 'homestay', hotel: 'hotel', motel: 'budget_hotel' }
  const stays = nearest(uniq(withD.filter((e) => stayType[t(e).tourism ?? ''])), 6)
  const eats = nearest(uniq(withD.filter((e) => /^(restaurant|cafe|fast_food)$/.test(t(e).amenity ?? ''))), 6)
  const self = selfName.toLowerCase()
  const near = nearest(uniq(withD.filter((e) =>
    (t(e).amenity === 'place_of_worship' || t(e).tourism === 'attraction' || t(e).tourism === 'viewpoint' || t(e).natural)
    && !(e.d < 0.5 && (self.includes(e.n.toLowerCase()) || e.n.toLowerCase().includes(self))))), 8)

  return {
    transport: [
      ...rail.map((e) => ({ type: 'rail' as const, name: e.n, code: t(e)['railway:ref'] ?? t(e).ref ?? null, distance_km: e.d })),
      ...bus.map((e) => ({ type: 'bus' as const, name: e.n, code: null, distance_km: e.d })),
      ...air.map((e) => ({ type: 'air' as const, name: e.n, code: t(e).iata ?? null, distance_km: e.d })),
    ],
    stays: stays.map((e) => ({ name: e.n, type: stayType[t(e).tourism!], distance_km: e.d, phone: phoneOf(t(e)), booking_url: webOf(t(e)) })),
    eateries: eats.map((e) => ({ name: e.n, pure_veg: t(e)['diet:vegetarian'] === 'only' ? 1 : 0, distance_km: e.d, phone: phoneOf(t(e)) })),
    nearby: near.map((e) => ({
      name: e.n,
      kind: t(e).amenity === 'place_of_worship' ? 'temple' : t(e).natural ? t(e).natural! : t(e).tourism === 'viewpoint' ? 'viewpoint' : 'attraction',
      distance_km: e.d,
    })),
  }
}
