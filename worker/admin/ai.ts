// AI drafting. The model reads the open-source facts we fetched, and may also search the web
// (official, government, tourism-board, temple-trust and reputable news sites). Everything it fills
// is marked "AI draft — verify" until an admin checks it, and the pages it used are kept for checking.

export interface AiFacts {
  name: string
  kind: 'vacation' | 'spiritual'
  location: string
  description?: string
  deity?: string | null
  wikipedia_extract?: string
  wikidata_facts?: Record<string, string>
  transport?: { type: string; name: string; code?: string | null; distance_km: number }[]
  nearby?: { name: string; kind: string; distance_km: number }[]
  existing_highlights?: string[]
}

export interface AiPractical {
  access_effort?: string; access_notes?: string; timings?: string; entry_fee?: string
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
}

const SYSTEM = `You research and write short, practical notes for Q-Locate, a quick location guide for budget travellers, backpackers and pilgrims.
What makes a note valuable: what the visitor will actually experience, how much effort it takes, when to go and when not to, and the one or two things people wish they had known.
Rules:
- Start from the facts JSON. If a web_search tool is available, use it (2-4 searches) to confirm and add practical details. Prefer official, government, forest-department, tourism-board and temple-trust sites, then Wikipedia and established news outlets. Ignore booking-site marketing and anonymous forums.
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
 "nearby_new": [{"name": "real place within about 40 km, only if the facts nearby list is empty", "kind": "${kind === 'spiritual' ? 'temple|waterfall|lake|peak|viewpoint|fort|attraction' : 'waterfall|lake|peak|viewpoint|temple|fort|beach|forest|attraction'}", "distance_km": 0, "what_to_expect": "at most 14 words"}],
 "practical": {"access_effort": "drive_up|short_walk|steps_climb|trek", "access_notes": "at most 120 characters, e.g. about 300 steps down to the pool",
   "timings": "", "entry_fee": "",
   ${kind === 'vacation'
     ? '"best_months": [month numbers 1-12 when a source supports it], "typical_visit": "few_hours|1_day|2_3_days|week_plus"'
     : '"dress_code": "", "festivals": "main festivals, at most 120 characters", "significance": "at most 160 characters", "tradition": "Shaiva|Vaishnava|Shakta|Jain|Buddhist|Sikh|other"'}}}`

type Block = { type: string; text?: string; content?: { type: string; url?: string; title?: string }[] | unknown; citations?: { url?: string; title?: string }[] }

async function call(apiKey: string, model: string, facts: AiFacts, web: boolean) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(110_000),
    headers: { 'x-api-key': apiKey.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] } : { temperature: 0 }),
      messages: [{ role: 'user', content: `${schema(facts.kind)}\n\nPlace: ${facts.name} (${facts.location})\n\nFacts:\n${JSON.stringify(facts)}` }],
    }),
  })
}

export async function draftWithAi(apiKey: string, model: string, facts: AiFacts, notes: string[] = [], web = true): Promise<AiDraft | null> {
  let res = await call(apiKey, model, facts, web)
  if (!res.ok && web && res.status === 400) {
    const t = await res.clone().text()
    if (/web.?search|tool/i.test(t)) { notes.push('AI web search unavailable on this API key; drafted from open sources only'); res = await call(apiKey, model, facts, false) }
  }
  if (!res.ok) {
    const t = await res.text()
    if (res.status === 401) throw new Error('AI key rejected (401) — replace the ANTHROPIC_API_KEY secret with a fresh key')
    if (/credit balance/i.test(t)) throw new Error('AI account has no credit — add credit at console.anthropic.com')
    if (res.status === 404 || /model/i.test(t)) throw new Error(`AI model "${model}" not available — check AI_MODEL`)
    throw new Error(`AI answered ${res.status}: ${t.slice(0, 120)}`)
  }
  const data = (await res.json()) as { content?: Block[] }
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
  const draft = parseDraft(text, facts)
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
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: Record<string, unknown>
  try { raw = JSON.parse(m[0]) } catch { return null }
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
  if (!allowed.size && Array.isArray(raw.nearby_new)) {
    const nn = (raw.nearby_new as Record<string, unknown>[])
      .map((n) => ({ name: str(n?.name, 120), kind: str(n?.kind, 30) || 'attraction', distance_km: Math.round(Number(n?.distance_km) * 10) / 10, what_to_expect: str(n?.what_to_expect, 120) }))
      .filter((n) => n.name && !/church|mosque|masjid|dargah|cathedral/i.test(n.name) && n.distance_km > 0 && n.distance_km <= 60)
      .slice(0, 6)
    if (nn.length) out.nearby_new = nn
  }
  const pr = (raw.practical ?? {}) as Record<string, unknown>
  const p: AiPractical = {}
  const ae = str(pr.access_effort, 20); if (ACCESS.includes(ae)) p.access_effort = ae
  const s = (k: keyof AiPractical, max: number) => { const v = str(pr[k], max); if (v) (p as Record<string, unknown>)[k] = v }
  s('access_notes', 160); s('timings', 140); s('entry_fee', 140)
  if (facts.kind === 'vacation') {
    const bm = Array.isArray(pr.best_months) ? [...new Set(pr.best_months.map(Number).filter((n) => n >= 1 && n <= 12))].sort((a, b) => a - b) : []
    if (bm.length && bm.length < 12) p.best_months = bm
    const tv = str(pr.typical_visit, 20); if (VISIT.includes(tv)) p.typical_visit = tv
  } else { s('dress_code', 160); s('festivals', 160); s('significance', 200); s('tradition', 30) }
  if (Object.keys(p).length) out.practical = p
  return out
}
