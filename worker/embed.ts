// Meaning-based search: text → numeric "fingerprint" (embedding) with Cloudflare Workers AI.
// Fingerprints are kept in D1 (table search_vectors) and compared inside the worker — fine for a few
// thousand items, with no extra Cloudflare setup. Without the AI binding, search falls back to words only.
export const EMBED_MODEL = '@cf/baai/bge-m3' // multilingual, 1024 dimensions

export interface SearchBindings { AI?: Ai }

export async function embed(env: SearchBindings, texts: string[]): Promise<Float32Array[]> {
  if (!env.AI) throw new Error('Workers AI is not connected')
  const r = (await env.AI.run(EMBED_MODEL as never, { text: texts } as never)) as { data?: number[][]; response?: number[][] }
  const out = r.data ?? r.response
  if (!Array.isArray(out) || out.length !== texts.length) throw new Error('Unexpected embedding response')
  return out.map(normalise)
}

export function normalise(v: ArrayLike<number>): Float32Array {
  const f = Float32Array.from(v as number[])
  let n = 0
  for (let i = 0; i < f.length; i++) n += f[i] * f[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < f.length; i++) f[i] /= n
  return f
}

// Stored as base64 text (compact and simple to read back).
export const pack = (v: Float32Array) => btoa(String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)))
export const unpack = (s: string) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Float32Array(u.buffer) }

export const ENSURE_TABLE = 'CREATE TABLE IF NOT EXISTS search_vectors (id TEXT PRIMARY KEY, vec TEXT NOT NULL, updated_at TEXT DEFAULT (datetime(\'now\')))'
