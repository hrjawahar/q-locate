// One way to call the AI for every admin feature: waits and retries when the service says "slow down"
// (rate limit 429, overloaded 529/503), and turns failures into plain messages.

export async function aiFetch(apiKey: string, body: unknown, timeoutMs: number): Promise<Response> {
  const send = () => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'x-api-key': apiKey.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let res = await send()
  for (let i = 0; i < 2 && [429, 503, 529].includes(res.status); i++) {
    const wait = Math.min(30, Math.max(5, Number(res.headers.get('retry-after')) || 15 * (i + 1)))
    await new Promise((r) => setTimeout(r, wait * 1000))
    res = await send()
  }
  return res
}

/** A short, plain explanation of a failed AI call. */
export async function aiError(res: Response): Promise<string> {
  const t = await res.text().catch(() => '')
  if (res.status === 401) return 'AI key rejected (401) — replace the ANTHROPIC_API_KEY secret with a fresh key'
  if (/credit balance/i.test(t)) return 'AI account has no credit — add credit at console.anthropic.com'
  if (res.status === 429) return 'AI rate limit reached (too many AI requests in a minute) — wait a minute and try again'
  if (res.status === 529 || res.status === 503) return 'AI service is busy right now — try again in a few minutes'
  if (res.status === 404 || /model/i.test(t)) return 'AI model not available — check AI_MODEL'
  return `AI answered ${res.status}: ${t.slice(0, 100)}`
}
