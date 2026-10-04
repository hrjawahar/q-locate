// Meaning-based search: text → numeric "fingerprint" (embedding) with Cloudflare Workers AI,
// stored and searched in Cloudflare Vectorize. Both are optional bindings; without them search
// simply falls back to word matching.
export const EMBED_MODEL = '@cf/baai/bge-m3' // multilingual, 1024 dimensions

export interface SearchBindings { AI?: Ai; VEC?: VectorizeIndex }

export async function embed(env: SearchBindings, texts: string[]): Promise<number[][]> {
  if (!env.AI) throw new Error('Workers AI is not connected')
  const r = (await env.AI.run(EMBED_MODEL as never, { text: texts } as never)) as { data?: number[][]; response?: number[][] }
  const out = r.data ?? r.response
  if (!Array.isArray(out) || out.length !== texts.length) throw new Error('Unexpected embedding response')
  return out
}
