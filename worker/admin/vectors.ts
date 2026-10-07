// Keeps the meaning-search index in step with what is published. Runs every minute from the cron:
// anything changed since the last run is (re)fingerprinted if published, or removed if not.
import { json, parseJson } from '../util'
import type { AdminEnv } from './auth'
import { embed, pack, ENSURE_TABLE, type SearchBindings } from '../embed'

type Env = AdminEnv & SearchBindings
const BATCH = 40

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const join = (...xs: unknown[]) => xs.filter((x) => typeof x === 'string' ? x.trim() : x != null && x !== '').join('. ').replace(/\s+/g, ' ').slice(0, 2000)

const SOURCES = {
  places: {
    prefix: 'p',
    sql: `SELECT p.id, p.status, p.updated_at, p.kind, p.name, p.alt_names, p.country, p.state, p.district_city, p.city, p.summary, p.highlights, p.tags,
            p.access_notes, p.timings, v.best_months, v.typical_visit, v.trek_notes, t.main_deity, t.tradition, t.significance, t.festivals, t.prasadam,
            (SELECT group_concat(c.name, ', ') FROM place_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.place_id = p.id) AS cats,
            (SELECT group_concat(n.name, ', ') FROM place_nearby n WHERE n.place_id = p.id) AS nearby
          FROM places p LEFT JOIN vacation_details v ON v.place_id = p.id LEFT JOIN temple_details t ON t.place_id = p.id`,
    text: (r: Record<string, unknown>) => join(
      r.name, r.kind === 'spiritual' ? 'Temple / spiritual place' : 'Travel destination', r.cats,
      [r.city, r.district_city, r.state, r.country].filter(Boolean).join(', '), r.alt_names && `Also called ${r.alt_names}`,
      r.main_deity && `Deity: ${r.main_deity}`, r.tradition, r.summary, parseJson<string[]>(r.highlights, []).join('. '), r.significance,
      r.festivals && `Festivals: ${r.festivals}`, r.prasadam, r.access_notes, r.trek_notes,
      String(r.best_months ?? '').split(',').map(Number).filter(Boolean).map((m) => MONTHS[m - 1]).join(' ') && `Best months: ${String(r.best_months).split(',').map(Number).filter(Boolean).map((m) => MONTHS[m - 1]).join(', ')}`,
      r.tags, r.nearby && `Nearby: ${r.nearby}`),
  },
  movies: {
    prefix: 'm',
    sql: 'SELECT id, status, updated_at, title, year, country, language, genres, doc_topic, pitch, runtime_min FROM movies',
    text: (r: Record<string, unknown>) => join(`${r.title} (${r.year ?? ''} movie)`, parseJson<string[]>(r.genres, []).join(', '), r.doc_topic && `About ${r.doc_topic}`,
      [r.country, r.language].filter(Boolean).join(', '), r.pitch),
  },
  books: {
    prefix: 'b',
    sql: 'SELECT id, status, updated_at, title, author, year, language, fiction, genres, topic, pitch FROM books',
    text: (r: Record<string, unknown>) => join(`${r.title}, a ${r.fiction === 0 ? 'non-fiction ' : r.fiction === 1 ? 'fiction ' : ''}book by ${r.author ?? 'unknown author'}`,
      parseJson<string[]>(r.genres, []).join(', '), r.topic && `About ${r.topic}`, r.pitch),
  },
  festivals: {
    prefix: 'f',
    sql: 'SELECT id, status, updated_at, name, alt_names, country, state, towns, kind, months, summary, tips FROM festivals',
    text: (r: Record<string, unknown>) => join(`${r.name} festival`, r.alt_names && `Also called ${r.alt_names}`, r.kind === 'religious' ? 'Religious festival' : r.kind === 'cultural' ? 'Cultural festival' : 'Religious and cultural festival',
      [r.towns, r.state, r.country].filter(Boolean).join(', '),
      String(r.months ?? '').split(',').map(Number).filter(Boolean).map((m) => MONTHS[m - 1]).join(', ') && `Celebrated in ${String(r.months).split(',').map(Number).filter(Boolean).map((m) => MONTHS[m - 1]).join(', ')}`,
      r.summary, r.tips),
  },
} as const

/** Process a batch of changed items per table. Returns how many were handled. */
export async function sync(env: Env) {
  if (!env.AI) return 0
  await env.DB.prepare(ENSURE_TABLE).run()
  let done = 0
  for (const [table, src] of Object.entries(SOURCES)) {
    const key = `vec_${table}`
    // Cursor = "updated_at|id" of the last item handled, so items changed in the same second are never skipped or repeated.
    const [sinceAt = '', sinceId = '0'] = ((await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<string>('value')) ?? '').split('|')
    let rows: Record<string, unknown>[]
    try {
      rows = (await env.DB.prepare(`SELECT * FROM (${src.sql}) WHERE updated_at > ? OR (updated_at = ? AND id > ?) ORDER BY updated_at, id LIMIT ${BATCH}`)
        .bind(sinceAt, sinceAt, Number(sinceId)).all<Record<string, unknown>>()).results
    } catch { continue } // table not created yet (e.g. books before its SQL was run)
    if (!rows.length) continue
    const live = rows.filter((r) => r.status === 'published')
    const gone = rows.filter((r) => r.status !== 'published').map((r) => `${src.prefix}:${r.id}`)
    const stmts: D1PreparedStatement[] = []
    if (live.length) {
      const vectors = await embed(env, live.map((r) => src.text(r)))
      live.forEach((r, i) => stmts.push(env.DB.prepare("INSERT INTO search_vectors (id, vec, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET vec = excluded.vec, updated_at = excluded.updated_at")
        .bind(`${src.prefix}:${r.id}`, pack(vectors[i]))))
    }
    gone.forEach((id) => stmts.push(env.DB.prepare('DELETE FROM search_vectors WHERE id = ?').bind(id)))
    // Tell the public app its copy of the fingerprints is out of date.
    stmts.push(env.DB.prepare("INSERT INTO meta (key, value) VALUES ('vec_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1"))
    await env.DB.batch(stmts)
    const last = rows[rows.length - 1]
    await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, `${last.updated_at}|${last.id}`).run()
    done += rows.length
  }
  return done
}

/** Admin: status and a "rebuild from scratch" switch. */
export async function count(env: Env) {
  return env.DB.prepare('SELECT count(*) AS n FROM search_vectors').first<number>('n').catch(() => 0)
}
export async function status(env: Env) {
  return json({ ai: !!env.AI, count: await count(env) })
}
export async function rebuild(env: Env) {
  await env.DB.prepare("DELETE FROM meta WHERE key IN ('vec_places', 'vec_movies', 'vec_books', 'vec_festivals')").run()
  return json({ ok: true })
}
