// AI drafting: writes short text ONLY from facts fetched from open sources.
// Every field it fills is marked "AI draft — verify" until an admin checks it.

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

export interface AiDraft {
  summary?: string
  highlights?: string[]
  how_to_reach?: string
  nearby?: { name: string; what_to_expect: string }[]
}

const SYSTEM = `You write short, factual notes for Q-Locate, a quick location guide for budget travellers and pilgrims in India and abroad.
Rules:
- Use ONLY the facts in the user's JSON. Never add facts, prices, timings, phone numbers, festivals or claims that are not in the facts.
- If the facts are not enough for a field, return an empty string or an empty list for it.
- Plain, neutral English. No hype words (must-visit, best, breathtaking, stunning, hidden gem). No safety or health promises.
- Distances are approximate straight-line distances; say "about" when you mention one.
- Output a single JSON object and nothing else.`

const SCHEMA = `Return JSON with exactly these keys:
{"summary": "1-2 sentences, at most 200 characters, what the place is and where",
 "highlights": ["3 to 5 concrete facts, each at most 12 words"],
 "how_to_reach": "2-4 short sentences using only the transport list (nearest railway station with code, bus stand, airport, approximate distances)",
 "nearby": [{"name": "exact name copied from the nearby list", "what_to_expect": "at most 12 words, only if the facts support it, else empty"}]}`

export async function draftWithAi(apiKey: string, model: string, facts: AiFacts): Promise<AiDraft | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: `${SCHEMA}\n\nFacts:\n${JSON.stringify(facts)}` }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    if (res.status === 401) throw new Error('AI key rejected (401) — replace the ANTHROPIC_API_KEY secret with a fresh key')
    if (/credit balance/i.test(t)) throw new Error('AI account has no credit — add credit at console.anthropic.com')
    throw new Error(`AI answered ${res.status}: ${t.slice(0, 120)}`)
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return parseDraft(data.content?.find((c) => c.type === 'text')?.text ?? '', facts)
}

/** Parse and sanity-check the model's JSON; drop anything that doesn't fit. */
export function parseDraft(text: string, facts: AiFacts): AiDraft | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: Record<string, unknown>
  try { raw = JSON.parse(m[0]) } catch { return null }
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const out: AiDraft = {}
  const summary = str(raw.summary, 260)
  if (summary) out.summary = summary
  const hl = Array.isArray(raw.highlights) ? raw.highlights.map((h) => str(h, 100)).filter(Boolean).slice(0, 5) : []
  if (hl.length >= 1) out.highlights = hl
  const how = str(raw.how_to_reach, 600)
  if (how) out.how_to_reach = how
  const allowed = new Set((facts.nearby ?? []).map((n) => n.name.toLowerCase()))
  const near = Array.isArray(raw.nearby) ? (raw.nearby as Record<string, unknown>[])
    .map((n) => ({ name: str(n?.name, 120), what_to_expect: str(n?.what_to_expect, 120) }))
    .filter((n) => n.name && n.what_to_expect && allowed.has(n.name.toLowerCase())) : []
  if (near.length) out.nearby = near
  return out
}
