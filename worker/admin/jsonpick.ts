/** The last {...} in a model reply that parses as JSON and has one of the expected keys.
 *  Copes with extra text before or after, code fences, and braces inside strings. */
export function lastJson(text: string, keys: string[]): Record<string, unknown> | null {
  const t = text.replace(/```(?:json)?/g, '')
  for (let end = t.lastIndexOf('}'); end > 0; end = t.lastIndexOf('}', end - 1)) {
    let depth = 0
    for (let i = end; i >= 0; i--) {
      if (t[i] === '}') depth++
      else if (t[i] === '{' && --depth === 0) {
        try { const o = JSON.parse(t.slice(i, end + 1)); if (o && typeof o === 'object' && keys.some((k) => k in o)) return o } catch { /* try an earlier start */ }
      }
    }
  }
  return null
}
