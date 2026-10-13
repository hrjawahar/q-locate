// AI drafting. The model reads the open-source facts we fetched, and may also search the web
// (official, government, tourism-board, temple-trust and reputable news sites). Everything it fills
// is marked "AI draft — verify" until an admin checks it, and the pages it used are kept for checking.

import { validScriptNames } from './scripts'
import { sourceHints, BLOCKED } from './trusted'
import { lastJson } from './jsonpick'
export interface AiFacts {
  name: string
  kind: 'vacation' | 'spiritual'
  location: string
  state?: string | null; district?: string | null; country?: string | null
  description?: string
  deity?: string | null
  wikipedia_extract?: string
  wikidata_facts?: Record<string, string>
  transport?: { type: string; name: string; code?: string | null; distance_km: number }[]
  nearby?: { name: string; kind: string; distance_km: number }[]
  existing_highlights?: string[]
  names_needed?: string[] // script codes still missing, e.g. ['te','kn','ml']
  categories_allowed?: { slug: string; name: string }[]
}

export interface AiPractical {
  access_effort?: string; access_notes?: string; timings?: string; entry_fee?: string; address?: string
  best_months?: number[]; typical_visit?: string
  dress_code?: string; festivals?: string; significance?: string; tradition?: string
}

export interface AiDraft {
  summary?: string
  highlights?: string[]
  how_to_reach?: string
  nearby?: { name: string; what_to_expect: string }[]
  nearby_new?: { name: string; kind: string; distance_km: number; what_to_expect: string }[]
  practical?: AiPractical
  refs?: { url: string; title: string }[]
  local_names?: string[]
  categories?: string[]
  stays_new?: AiStay[]
}
export interface AiStay { name: string; type: string; distance_km: number | null; price_from: number | null; url: string | null }

const SYSTEM = `You research and write short, practical notes for Q-Locate, a quick location guide for budget travellers, backpackers and pilgrims.
What makes a note valuable: what the visitor will actually experience, how much effort it takes, when to go and when not to, and the one or two things people wish they had known.
Rules:
- Start from the facts JSON. If a web_search tool is available, use it (3-6 searches) to confirm and add practical details: timings, entry fees, address with PIN code, how to reach, well-known sights nearby, and budget stays (search e.g. "<town> hostel", "<town> dormitory", "<town> government stay"). Use the official sources listed in the message first (Incredible India, the state tourism board, the district website, ASI, temple trusts), then Wikipedia and established news outlets. Ignore booking-site marketing and anonymous forums.
- Never invent anything. Every fact must come from the facts JSON or a page you read. If unsure, leave the field empty.
- Timings and entry fees: only if a source states them; add the source year if shown, e.g. "6 am - 5 pm (forest dept, 2025)".
- Plain, neutral English. No hype words (must-visit, best, breathtaking, stunning, hidden gem, paradise). No safety guarantees; state real cautions plainly (e.g. "closed to visitors in heavy monsoon").
- Distances are approximate; say "about".
- Nearby places: never list churches or mosques.
- Finish with a single JSON object and nothing after it.`

const schema = (kind: 'vacation' | 'spiritual') => `Return JSON with exactly these keys (use "" or [] when unknown):
{"summary": "2-3 sentences, at most 380 characters: what it is and where, what the visit is like (walk, steps, crowd, water, view), and when to go",
 "highlights": ["3 to 5 specific, useful facts, each at most 14 words; no repeats of the summary"],
 "how_to_reach": "2-4 short sentences: nearest railway station with code, nearest town and the road/bus for the last stretch, airport; approximate distances",
 "nearby": [{"name": "exact name copied from the facts nearby list", "what_to_expect": "at most 14 words"}],
 "nearby_new": [{"name": "up to 6 well-known sights within about 30 km that visitors commonly combine with this place (from your research), not already in the facts nearby list", "kind": "${kind === 'spiritual' ? 'temple|waterfall|lake|peak|viewpoint|fort|attraction' : 'waterfall|lake|peak|viewpoint|temple|fort|beach|forest|attraction'}", "distance_km": 0, "what_to_expect": "at most 14 words"}],
 "budget_stays": [{"name": "up to 4 budget stays near this place, found in your research: backpacker hostels (e.g. Zostel, goStops, The Hosteller, Moustache), government-run stays (state tourism, KTDC/KSRTC-style, forest department rest houses, PWD/IB, temple-trust cottages and dharmashalas), dormitories and budget homestays; only ones a source shows as operating", "type": "hostel|dorm|homestay|budget_hotel|dharmashala|govt", "distance_km": 0, "price_from": "lowest per-night price in rupees as a number if a source states it, else 0", "url": "official or the operator's own page, else \"\""}],
 "practical": {"access_effort": "drive_up|short_walk|steps_climb|trek", "access_notes": "at most 120 characters, e.g. about 300 steps down to the pool",
   "timings": "", "entry_fee": "", "address": "full postal address with PIN code, only if an official or reliable source states it",
   ${kind === 'vacation'
     ? '"best_months": [month numbers 1-12 when a source supports it], "typical_visit": "few_hours|1_day|2_3_days|week_plus"'
     : '"dress_code": "", "festivals": "main festivals, at most 120 characters", "significance": "at most 160 characters", "tradition": "Shaiva|Vaishnava|Shakta|Jain|Buddhist|Sikh|other"'}}}`

type Block = { type: string; text?: string; content?: { type: string; url?: string; title?: string }[] | unknown; citations?: { url?: string; title?: string }[] }

async function call(apiKey: string, model: string, facts: AiFacts, web: boolean, block = true) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(170_000),
    headers: { 'x-api-key': apiKey.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      system: SYSTEM,
      ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8, ...(block ? { blocked_domains: BLOCKED } : {}) }] } : { temperature: 0 }),
      messages: [{ role: 'user', content: `${schema(facts.kind)}${facts.names_needed?.length ? `\nAlso add the key "local_names": {${facts.names_needed.map((k) => `"${k}": ""`).join(', ')}} — the place's name as written in ${facts.names_needed.map((k) => ({ ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', hi: 'Hindi' } as Record<string, string>)[k]).join(', ')} script (as used on signboards or official sites; a careful transliteration of the proper name if none is published).` : ''}${facts.categories_allowed?.length ? `\nAlso add the key "categories": [every slug that fits, from: ${facts.categories_allowed.map((c) => `"${c.slug}" (${c.name})`).join(', ')}] — e.g. a temple on a hill or reached by steps is also "hill-temple".` : ''}\n\n${web ? `${sourceHints(facts.state, facts.district, facts.country)}\n\n` : ''}Place: ${facts.name} (${facts.location})\n\nFacts:\n${JSON.stringify(facts)}` }],
    }),
  })
}

export async function draftWithAi(apiKey: string, model: string, facts: AiFacts, notes: string[] = [], web = true): Promise<AiDraft | null> {
  let res = await call(apiKey, model, facts, web)
  if (!res.ok && web && res.status === 400) {
    const t = await res.clone().text()
    // The "skip these sites" list was refused: search again without it before giving up on web search.
    if (/blocked_domains|domain/i.test(t)) { res = await call(apiKey, model, facts, true, false); if (res.ok) notes.push('AI searched without the skip-list (refused by the AI service)') }
    if (!res.ok && res.status === 400 && /web.?search|tool/i.test(await res.clone().text())) { notes.push('AI web search unavailable on this API key; drafted from open sources only'); res = await call(apiKey, model, facts, false) }
  }
  if (!res.ok) {
    const t = await res.text()
    if (res.status === 401) throw new Error('AI key rejected (401) — replace the ANTHROPIC_API_KEY secret with a fresh key')
    if (/credit balance/i.test(t)) throw new Error('AI account has no credit — add credit at console.anthropic.com')
    if (res.status === 404 || /model/i.test(t)) throw new Error(`AI model "${model}" not available — check AI_MODEL`)
    throw new Error(`AI answered ${res.status}: ${t.slice(0, 120)}`)
  }
  const data = (await res.json()) as { content?: Block[]; stop_reason?: string }
  if (data.stop_reason === 'max_tokens') notes.push('AI reply was cut short')
  const blocks = data.content ?? []
  // Pages the model looked at, kept so the editor can check the draft.
  const refs = new Map<string, string>()
  for (const b of blocks) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content as { url?: string; title?: string }[]) if (r.url) refs.set(r.url, r.title ?? r.url)
  }
  const cited = new Map<string, string>()
  for (const b of blocks) for (const c of b.citations ?? []) if (c.url) cited.set(c.url, c.title ?? c.url)
  const lastTool = blocks.map((b) => b.type).lastIndexOf('web_search_tool_result')
  const text = blocks.slice(lastTool + 1).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  // If the JSON isn't after the last search, look through all the text the model wrote.
  const draft = parseDraft(text, facts) ?? parseDraft(blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(''), facts)
  if (!draft) notes.push('AI reply could not be read (no JSON found) — try Rewrite with AI again')
  if (draft) {
    const use = cited.size ? cited : refs
    draft.refs = [...use].slice(0, 6).map(([url, title]) => ({ url, title: title.slice(0, 160) }))
  }
  return draft
}

const ACCESS = ['drive_up', 'short_walk', 'steps_climb', 'trek']
const VISIT = ['few_hours', '1_day', '2_3_days', 'week_plus']

/** Parse and sanity-check the model's JSON; drop anything that doesn't fit. */
export function parseDraft(text: string, facts: AiFacts): AiDraft | null {
  const raw = lastJson(text, ['summary', 'practical', 'highlights'])
  if (!raw) return null
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/<\/?cite[^>]*>/g, '').trim().slice(0, max) : '')
  const out: AiDraft = {}
  const summary = str(raw.summary, 420)
  if (summary) out.summary = summary
  const hl = Array.isArray(raw.highlights) ? raw.highlights.map((h) => str(h, 110)).filter(Boolean).slice(0, 5) : []
  if (hl.length >= 1) out.highlights = hl
  const how = str(raw.how_to_reach, 700)
  if (how) out.how_to_reach = how
  const allowed = new Set((facts.nearby ?? []).map((n) => n.name.toLowerCase()))
  const near = Array.isArray(raw.nearby) ? (raw.nearby as Record<string, unknown>[])
    .map((n) => ({ name: str(n?.name, 120), what_to_expect: str(n?.what_to_expect, 120) }))
    .filter((n) => n.name && n.what_to_expect && allowed.has(n.name.toLowerCase())) : []
  if (near.length) out.nearby = near
  if (Array.isArray(raw.nearby_new)) {
    const nn = (raw.nearby_new as Record<string, unknown>[])
      .map((n) => ({ name: str(n?.name, 120), kind: str(n?.kind, 30) || 'attraction', distance_km: Math.round(Number(n?.distance_km) * 10) / 10, what_to_expect: str(n?.what_to_expect, 120) }))
      .filter((n) => n.name && !allowed.has(n.name.toLowerCase()) && !/church|mosque|masjid|dargah|cathedral/i.test(n.name) && n.distance_km > 0 && n.distance_km <= 60)
      .slice(0, 6)
    if (nn.length) out.nearby_new = nn
  }
  const pr = (raw.practical ?? {}) as Record<string, unknown>
  const p: AiPractical = {}
  const ae = str(pr.access_effort, 20); if (ACCESS.includes(ae)) p.access_effort = ae
  const s = (k: keyof AiPractical, max: number) => { const v = str(pr[k], max); if (v) (p as Record<string, unknown>)[k] = v }
  s('access_notes', 160); s('timings', 140); s('entry_fee', 140); s('address', 220)
  if (facts.kind === 'vacation') {
    const bm = Array.isArray(pr.best_months) ? [...new Set(pr.best_months.map(Number).filter((n) => n >= 1 && n <= 12))].sort((a, b) => a - b) : []
    if (bm.length && bm.length < 12) p.best_months = bm
    const tv = str(pr.typical_visit, 20); if (VISIT.includes(tv)) p.typical_visit = tv
  } else { s('dress_code', 160); s('festivals', 160); s('significance', 200); s('tradition', 30) }
  if (Object.keys(p).length) out.practical = p
  const STAY_T = ['hostel', 'dorm', 'homestay', 'budget_hotel', 'dharmashala', 'govt']
  if (Array.isArray(raw.budget_stays)) {
    const st = (raw.budget_stays as Record<string, unknown>[]).map((x) => {
      const d = Math.round(Number(x?.distance_km) * 10) / 10, pr = Math.round(Number(x?.price_from)), u = str(x?.url, 300)
      return { name: str(x?.name, 120), type: STAY_T.includes(str(x?.type, 20)) ? str(x?.type, 20) : 'hostel', distance_km: d > 0 && d <= 60 ? d : null,
        price_from: pr > 0 && pr < 50000 ? pr : null, url: /^https?:\/\//.test(u) ? u : null }
    }).filter((x) => x.name).slice(0, 4)
    if (st.length) out.stays_new = st
  }
  const okCats = new Set((facts.categories_allowed ?? []).map((c) => c.slug))
  const cats = Array.isArray(raw.categories) ? [...new Set(raw.categories.map((c) => str(c, 40)).filter((c) => okCats.has(c)))] : []
  if (cats.length) out.categories = cats
  const ln = validScriptNames(raw.local_names, facts.names_needed ?? [])
  if (ln.length) out.local_names = ln
  return out
}
