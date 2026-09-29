export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown> = {}) { super(message) }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await fetch(`/api/admin${path}`, {
    ...rest,
    headers: json !== undefined ? { 'content-type': 'application/json', ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(String(data.error ?? `Error ${res.status}`), res.status, data)
  return data as T
}

export type Role = 'owner' | 'publisher' | 'editor'
export interface Me { email: string; role: Role; scope: 'all' | 'vacation' | 'spiritual' }
export interface Lookups {
  categories: { id: number; kind: string; slug: string; name: string }[]
  circuits: { id: number; slug: string; name: string; total_count: number | null }[]
}

export const STATUS_LABEL: Record<string, string> = { draft: 'Draft', review: 'In review', published: 'Published', archived: 'Archived' }
export const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-stone-200 text-stone-800',
  review: 'bg-amber-100 text-amber-900',
  published: 'bg-green-100 text-green-900',
  archived: 'bg-stone-100 text-stone-500',
}
