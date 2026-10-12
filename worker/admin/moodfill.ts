// "Add moods" for books and films already in the app: the AI suggests moods + a "why it may help" line
// from what we already know about the title. Saved for the editor to check (hidden from users until then).
import { json, parseJson } from '../util'
import { type AdminEnv, type Admin, canPublish } from './auth'
import { MOOD_PROMPT, moodKeys } from '../moods'

type Env = AdminEnv & { ANTHROPIC_API_KEY?: string; AI_MODEL?: string }

export async function suggestMoods(kind: 'book' | 'movie', id: number, env: Env, a: Admin) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI is off (no ANTHROPIC_API_KEY)' }, { status: 400 })
  const table = kind === 'book' ? 'books' : 'movies'
  const r = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>()
  if (!r) return json({ error: 'not_found' }, { status: 404 })
  if (r.status === 'published' && !canPublish(a)) return json({ error: 'Only a publisher or owner can change a published item' }, { status: 403 })
  const about = kind === 'book'
    ? `Book: ${r.title}${r.author ? ` by ${r.author}` : ''}${r.year ? ` (${r.year})` : ''}. ${r.fiction === 1 ? 'Fiction' : r.fiction === 0 ? 'Non-fiction' : ''}. Categories: ${parseJson<string[]>(r.genres, []).join(', ')}. ${r.topic ? `Topic: ${r.topic}. ` : ''}Pitch: ${r.pitch ?? ''}`
    : `Film: ${r.title}${r.year ? ` (${r.year})` : ''}. Categories: ${parseJson<string[]>(r.genres, []).join(', ')}. ${r.doc_topic ? `About: ${r.doc_topic}. ` : ''}Pitch: ${r.pitch ?? ''}`
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY.trim().replace(/^["']|["']$/g, ''), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 400, temperature: 0,
      system: 'You tag books and films for a gentle "read/watch for your mood" feature. Use what you reliably know about the title and the details given. Never recommend something for a mood it could make worse (e.g. a bleak tragedy for someone grieving). If unsure, give fewer moods. Reply with one JSON object only.',
      messages: [{ role: 'user', content: `${about}\nReturn JSON: {${MOOD_PROMPT}}` }],
    }),
  })
  if (!res.ok) return json({ error: `AI answered ${res.status}` }, { status: 502 })
  const text = ((await res.json()) as { content?: { type: string; text?: string }[] }).content?.find((c) => c.type === 'text')?.text ?? ''
  let raw: Record<string, unknown> = {}
  try { raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') } catch { /* ignore */ }
  const moods = moodKeys(raw.moods)
  const note = typeof raw.mood_note === 'string' ? raw.mood_note.trim().slice(0, 200) : null
  if (!moods.length) return json({ ok: false, note: 'No clear moods for this one' })
  const pending = new Set(parseJson<string[]>(r.ai_pending, [])); pending.add('moods')
  await env.DB.batch([
    env.DB.prepare(`UPDATE ${table} SET moods = ?, mood_note = ?, ai_pending = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(JSON.stringify(moods), note, JSON.stringify([...pending]), a.email, id),
    env.DB.prepare(`INSERT INTO audit_log (actor, action, entity, entity_id) VALUES (?, 'suggest_moods', ?, ?)`).bind(a.email, kind, String(id)),
  ])
  return json({ ok: true, moods, mood_note: note })
}
