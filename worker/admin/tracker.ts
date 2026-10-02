// Heritage temple tracker: a state-by-state list of historic temples in India from Wikidata (CC0),
// with each one's Q-Locate status (not started / in Q-Locate / published) worked out live.
// The list is stored in R2 (admin-data/, never served publicly) and refreshed one state at a time.
import { json } from '../util'
import type { AdminEnv } from './auth'
import { sparql, resolveType } from './sources'

const KEY = 'admin-data/heritage-temples.json'
const HINDU_TEMPLE = 'Q842402'

export interface TItem {
  id: string; name: string; desc: string; state: string; stateId: string; district: string
  year: number | null      // year built, from Wikidata "inception"; negative = BCE
  asi: boolean             // has an ASI monument ID (centrally protected)
  heritage: string         // heritage designations, e.g. "Monument of National Importance"
  wiki: string             // English Wikipedia article, if any
  faith: 'Hindu' | 'Jain'
}
interface Store { updated: Record<string, string>; states: { id: string; name: string }[]; items: TItem[]; skipped: string[]; jainClass?: string }

async function load(env: AdminEnv): Promise<Store> {
  const o = await env.PHOTOS.get(KEY)
  return o ? (await o.json()) as Store : { updated: {}, states: [], items: [], skipped: [] }
}
const save = (env: AdminEnv, s: Store) => env.PHOTOS.put(KEY, JSON.stringify(s), { httpMetadata: { contentType: 'application/json' } })

const qid = (uri?: string) => uri?.split('/').pop() ?? ''

/** States and union territories of India. */
async function fetchStates() {
  const rows = await sparql(`SELECT DISTINCT ?s ?sLabel WHERE {
  VALUES ?c { wd:Q131541 wd:Q467745 } ?s wdt:P31 ?c . FILTER NOT EXISTS { ?s wdt:P576 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } ORDER BY ?sLabel`, 30000)
  return rows.map((r) => ({ id: qid(r.s?.value), name: r.sLabel?.value ?? '' })).filter((s) => s.id && !/^Q\d+$/.test(s.name))
}

/** Every Hindu or Jain temple Wikidata places inside one state, with date, heritage status and article. */
async function fetchState(stateId: string, stateName: string, jainClass: string | undefined): Promise<TItem[]> {
  const classes = [`wd:${HINDU_TEMPLE}`, ...(jainClass ? [`wd:${jainClass}`] : [])].join(' ')
  const rows = await sparql(`SELECT ?i ?iLabel ?desc ?cls ?inc ?asi ?hLabel ?loc ?locLabel ?article WHERE {
  ?i wdt:P131+ wd:${stateId} .
  VALUES ?cls { ${classes} } ?i wdt:P31/wdt:P279* ?cls .
  OPTIONAL { ?i wdt:P571 ?inc }
  OPTIONAL { ?i wdt:P1371 ?asi }
  OPTIONAL { ?i wdt:P1435 ?h }
  OPTIONAL { ?i wdt:P131 ?loc }
  OPTIONAL { ?article schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?i schema:description ?desc FILTER(lang(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 20000`, 65000)
  const by = new Map<string, TItem & { _h: Set<string> }>()
  for (const r of rows) {
    const id = qid(r.i?.value), name = r.iLabel?.value ?? ''
    if (!id || !name || /^Q\d+$/.test(name)) continue
    let it = by.get(id)
    if (!it) {
      it = { id, name, desc: r.desc?.value ?? '', state: stateName, stateId, district: '', year: null, asi: false, heritage: '', wiki: '', faith: 'Hindu', _h: new Set() }
      by.set(id, it)
    }
    if (qid(r.cls?.value) === jainClass) it.faith = 'Jain'
    const m = r.inc?.value?.match(/^(-?\d+)-/)
    if (m) { const y = Number(m[1]); if (it.year == null || y < it.year) it.year = y }
    if (r.asi?.value) it.asi = true
    if (r.hLabel?.value && !/^Q\d+$/.test(r.hLabel.value)) it._h.add(r.hLabel.value)
    if (!it.district && r.locLabel?.value && !/^Q\d+$/.test(r.locLabel.value) && qid(r.loc?.value) !== stateId) it.district = r.locLabel.value.replace(/\s+district$/i, '')
    if (r.article?.value) it.wiki = r.article.value
  }
  return [...by.values()].map(({ _h, ...it }) => ({ ...it, heritage: [..._h].join('; ').slice(0, 200) }))
}

/** GET /tracker — the stored list plus each temple's live Q-Locate status. */
export async function get(env: AdminEnv) {
  const s = await load(env)
  const { results } = await env.DB.prepare("SELECT id, wikidata_id, status, verified_on FROM places WHERE kind = 'spiritual' AND wikidata_id IS NOT NULL").all<{ id: number; wikidata_id: string; status: string; verified_on: string | null }>()
  const queued = await env.DB.prepare("SELECT DISTINCT wikidata_id FROM import_queue WHERE status IN ('pending','processing')").all<{ wikidata_id: string }>()
  const status: Record<string, { id: number; status: string; verified_on: string | null }> = {}
  for (const r of results) status[r.wikidata_id] = { id: r.id, status: r.status, verified_on: r.verified_on }
  return json({ ...s, status, queued: queued.results.map((q) => q.wikidata_id) })
}

/** POST /tracker/refresh {state?} — without a state: refresh the list of states. With one: refetch that state's temples. */
export async function refresh(body: Record<string, unknown>, env: AdminEnv) {
  const s = await load(env)
  if (!body.state) {
    s.states = await fetchStates()
    if (!s.jainClass) s.jainClass = (await resolveType('Jain temple').catch(() => null))?.id
    await save(env, s)
    return json({ ok: true, states: s.states })
  }
  const st = s.states.find((x) => x.id === body.state)
  if (!st) return json({ error: 'Unknown state — refresh the list of states first' }, { status: 400 })
  const items = await fetchState(st.id, st.name, s.jainClass)
  // A temple can sit in two states' trees by mistake; keep the first state that claimed it.
  const elsewhere = new Set(s.items.filter((i) => i.stateId !== st.id).map((i) => i.id))
  s.items = [...s.items.filter((i) => i.stateId !== st.id), ...items.filter((i) => !elsewhere.has(i.id))]
  s.updated[st.id] = new Date().toISOString()
  await save(env, s)
  return json({ ok: true, state: st.name, count: items.length })
}

/** POST /tracker/skip {ids, skip} — hide temples you don't plan to publish (or bring them back). */
export async function skip(body: Record<string, unknown>, env: AdminEnv) {
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^Q\d+$/.test(x)) : []
  const s = await load(env)
  const set = new Set(s.skipped)
  for (const id of ids) body.skip === false ? set.delete(id) : set.add(id)
  s.skipped = [...set]
  await save(env, s)
  return json({ ok: true, skipped: s.skipped })
}
