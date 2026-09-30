import { json, parseJson } from '../util'
import type { AdminEnv, Admin } from './auth'
import { wdPlace, wdSearch, resolveType, listByType, wikiExtract, commonsPhoto, download, overpass, suggestions, wdTransport, type WdPlace, type Suggestions, type Hub } from './sources'
import { draftWithAi, type AiDraft } from './ai'

type Kind = 'vacation' | 'spiritual'
interface TypePreset { id: string; label: string; kind: Kind; mode: 'type'; typeLabel: string; category: string; scope: 'india' | 'intl' }
interface NamesPreset { id: string; label: string; kind: Kind; mode: 'names'; circuit: string; category: string; names: string[] }
type Preset = TypePreset | NamesPreset

const T = (id: string, label: string, kind: Kind, typeLabel: string, category: string, scope: 'india' | 'intl' = 'india'): TypePreset =>
  ({ id, label, kind, mode: 'type', typeLabel, category, scope })

export const PRESETS: Preset[] = [
  T('hill-stations', 'Hill stations', 'vacation', 'hill station', 'hill-station'),
  T('waterfalls', 'Waterfalls', 'vacation', 'waterfall', 'waterfall'),
  T('beaches', 'Beaches', 'vacation', 'beach', 'beach'),
  T('lakes', 'Lakes', 'vacation', 'lake', 'lake'),
  T('national-parks', 'National parks', 'vacation', 'national park', 'wildlife'),
  T('sanctuaries', 'Wildlife sanctuaries', 'vacation', 'wildlife sanctuary', 'wildlife'),
  T('forts', 'Forts', 'vacation', 'fort', 'heritage'),
  T('islands', 'Islands', 'vacation', 'island', 'island'),
  T('backwaters', 'Backwaters', 'vacation', 'backwater', 'backwaters'),
  T('ashrams', 'Ashrams and retreats', 'vacation', 'ashram', 'retreat'),
  T('intl-national-parks', 'National parks (abroad)', 'vacation', 'national park', 'wildlife', 'intl'),
  T('intl-beaches', 'Beaches (abroad)', 'vacation', 'beach', 'beach', 'intl'),
  T('intl-waterfalls', 'Waterfalls (abroad)', 'vacation', 'waterfall', 'waterfall', 'intl'),
  T('hindu-temples', 'Hindu temples', 'spiritual', 'Hindu temple', 'temple'),
  T('cave-temples', 'Cave temples', 'spiritual', 'cave temple', 'cave-temple'),
  T('jain-temples', 'Jain temples', 'spiritual', 'Jain temple', 'jain-temple'),
  T('gurdwaras', 'Gurdwaras', 'spiritual', 'gurdwara', 'gurdwara'),
  T('monasteries', 'Buddhist monasteries', 'spiritual', 'Buddhist monastery', 'monastery'),
  T('intl-hindu-temples', 'Hindu temples (abroad)', 'spiritual', 'Hindu temple', 'temple', 'intl'),
  { id: 'jyotirlinga', label: '12 Jyotirlingas', kind: 'spiritual', mode: 'names', circuit: 'jyotirlinga', category: 'temple', names: [
    'Somnath Temple', 'Mallikarjuna Temple, Srisailam', 'Mahakaleshwar Jyotirlinga', 'Omkareshwar Temple', 'Kedarnath Temple',
    'Bhimashankar Temple', 'Kashi Vishwanath Temple', 'Trimbakeshwar Shiva Temple', 'Baidyanath Temple', 'Nageshvara Jyotirlinga',
    'Ramanathaswamy Temple', 'Grishneshwar Temple'] },
  { id: 'arupadai-veedu', label: 'Arupadai Veedu (6 abodes of Murugan)', kind: 'spiritual', mode: 'names', circuit: 'arupadai-veedu', category: 'temple', names: [
    'Thiruparankundram Murugan Temple', 'Tiruchendur Murugan Temple', 'Palani Murugan Temple', 'Swamimalai Murugan Temple',
    'Thiruthani Murugan Temple', 'Pazhamudircholai Murugan Temple'] },
  { id: 'pancha-bhoota', label: 'Pancha Bhoota Sthalams', kind: 'spiritual', mode: 'names', circuit: 'pancha-bhoota', category: 'temple', names: [
    'Ekambareswarar Temple', 'Jambukeswarar Temple, Thiruvanaikaval', 'Annamalaiyar Temple', 'Srikalahasteeswara Temple', 'Thillai Nataraja Temple, Chidambaram'] },
  { id: 'char-dham', label: 'Char Dham', kind: 'spiritual', mode: 'names', circuit: 'char-dham', category: 'temple', names: [
    'Badrinath Temple', 'Dwarkadhish Temple', 'Jagannath Temple, Puri', 'Ramanathaswamy Temple'] },
  { id: 'chota-char-dham', label: 'Chota Char Dham', kind: 'spiritual', mode: 'names', circuit: 'chota-char-dham', category: 'temple', names: [
    'Yamunotri Temple', 'Gangotri Temple', 'Kedarnath Temple', 'Badrinath Temple'] },
  { id: 'navagraha', label: 'Navagraha Temples (Tamil Nadu)', kind: 'spiritual', mode: 'names', circuit: 'navagraha', category: 'temple', names: [
    'Suryanar Kovil', 'Kailasanathar Temple, Thingalur', 'Vaitheeswaran Koil', 'Swetharanyeswarar Temple', 'Apatsahayesvarar Temple, Alangudi',
    'Agniswarar Temple, Kanjanur', 'Thirunallar Saniswaran Temple', 'Naganathaswamy Temple, Thirunageswaram', 'Naganathar Temple, Keezhaperumpallam'] },
  { id: 'pancha-sabhai', label: 'Pancha Sabhai', kind: 'spiritual', mode: 'names', circuit: 'pancha-sabhai', category: 'temple', names: [
    'Thillai Nataraja Temple, Chidambaram', 'Meenakshi Temple', 'Nellaiappar Temple', 'Kutralanathar Temple', 'Vadaranyeswarar Temple'] },
]

export const listPresets = () => json({ presets: PRESETS.map(({ ...p }) => ({ ...p, names: undefined, count: p.mode === 'names' ? p.names.length : undefined })) })

interface PreviewItem { id: string; label: string; description: string; exists?: number | null; queued?: boolean; position?: number; alternatives?: { id: string; label: string; description: string }[]; query?: string }

async function markExisting(env: AdminEnv, items: PreviewItem[]) {
  if (!items.length) return items
  const ids = items.map((i) => i.id)
  const found = new Map<string, number>(), queued = new Set<string>()
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90), ph = chunk.map(() => '?').join(',')
    const [p, q] = await env.DB.batch([
      env.DB.prepare(`SELECT id, wikidata_id FROM places WHERE wikidata_id IN (${ph})`).bind(...chunk),
      env.DB.prepare(`SELECT wikidata_id FROM import_queue WHERE status IN ('pending','processing') AND wikidata_id IN (${ph})`).bind(...chunk),
    ])
    for (const r of p.results as { id: number; wikidata_id: string }[]) found.set(r.wikidata_id, r.id)
    for (const r of q.results as { wikidata_id: string }[]) queued.add(r.wikidata_id)
  }
  return items.map((i) => ({ ...i, exists: found.get(i.id) ?? null, queued: queued.has(i.id) }))
}

export async function preview(body: Record<string, unknown>, env: AdminEnv) {
  const preset = PRESETS.find((p) => p.id === body.preset)
  const customType = typeof body.type_label === 'string' ? body.type_label.trim() : ''
  const region = typeof body.region === 'string' ? body.region.trim() : ''
  const countryName = typeof body.country === 'string' ? body.country.trim() : ''
  const notableOnly = body.notable_only !== false

  if (preset?.mode === 'names' || Array.isArray(body.names)) {
    const names = preset?.mode === 'names' ? preset.names : (body.names as unknown[]).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 40)
    const items: PreviewItem[] = []
    for (const [i, n] of names.entries()) {
      const hits = await wdSearch(n, 3).catch(() => [])
      items.push(hits[0]
        ? { ...hits[0], position: preset ? i + 1 : undefined, alternatives: hits.slice(1), query: n }
        : { id: '', label: n, description: 'Not found on Wikidata — add it by hand', query: n })
    }
    const valid = await markExisting(env, items.filter((x) => x.id))
    return json({ mode: 'names', items: [...valid, ...items.filter((x) => !x.id)] })
  }

  const typeLabel = customType || (preset?.mode === 'type' ? preset.typeLabel : '')
  if (!typeLabel) return json({ error: 'Choose a collection or type a kind of place' }, { status: 400 })
  const type = await resolveType(typeLabel)
  if (!type) return json({ error: `No Wikidata type found for “${typeLabel}”` }, { status: 404 })
  const intl = preset?.mode === 'type' ? preset.scope === 'intl' : body.scope === 'intl'
  let countryId: string | null = 'Q668'
  let country: { id: string; label: string } | null = { id: 'Q668', label: 'India' }
  if (intl) {
    if (countryName) {
      const c = (await wdSearch(countryName, 1))[0]
      if (!c) return json({ error: `Country “${countryName}” not found` }, { status: 404 })
      countryId = c.id; country = { id: c.id, label: c.label }
    } else { countryId = null; country = null }
  }
  const list = await listByType({ typeId: type.id, countryId, excludeIndia: intl && !countryId, region: region || undefined, notableOnly })
  return json({ mode: 'type', type, country, items: await markExisting(env, list) })
}

export async function enqueue(body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : []
  const kind = body.kind === 'spiritual' ? 'spiritual' : 'vacation'
  if (a.scope !== 'all' && a.scope !== kind) return json({ error: 'Outside your scope' }, { status: 403 })
  const clean = items.filter((i) => typeof i.id === 'string' && /^Q\d+$/.test(i.id)).slice(0, 1000)
  const stmts = clean.map((i) => env.DB.prepare(
    `INSERT INTO import_queue (wikidata_id, label, kind, category_slug, circuit_slug, circuit_position, queued_by)
     SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM import_queue WHERE wikidata_id = ? AND status IN ('pending','processing'))`,
  ).bind(i.id, String(i.label ?? ''), kind, body.category ?? null, body.circuit ?? null, i.position == null ? null : Number(i.position), a.email, i.id))
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50))
  return status(env)
}

export async function status(env: AdminEnv) {
  const [counts, recent, batch] = await env.DB.batch([
    env.DB.prepare('SELECT status, count(*) AS n FROM import_queue GROUP BY status'),
    env.DB.prepare("SELECT id, wikidata_id, label, status, error, place_id, finished_at FROM import_queue WHERE status IN ('error','done','skipped') ORDER BY id DESC LIMIT 30"),
    // The current batch: everything queued since the oldest item that is still waiting or working.
    env.DB.prepare(`SELECT status, count(*) AS n FROM import_queue WHERE id >= COALESCE((SELECT min(id) FROM import_queue WHERE status IN ('pending','processing')), (SELECT max(id) + 1 FROM import_queue)) GROUP BY status`),
  ])
  const b: Record<string, number> = { pending: 0, processing: 0, done: 0, skipped: 0, error: 0 }
  for (const r of batch.results as { status: string; n: number }[]) b[r.status] = r.n
  const c: Record<string, number> = { pending: 0, processing: 0, done: 0, skipped: 0, error: 0 }
  for (const r of counts.results as { status: string; n: number }[]) c[r.status] = r.n
  return json({ counts: c, batch: b, recent: recent.results, ai: !!(env as AdminEnv & { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY })
}

export async function retryErrors(env: AdminEnv) {
  await env.DB.prepare("UPDATE import_queue SET status = 'pending', attempts = 0, error = NULL WHERE status = 'error'").run()
  return status(env)
}
export async function clearPending(env: AdminEnv) {
  await env.DB.prepare("DELETE FROM import_queue WHERE status = 'pending'").run()
  return status(env)
}

// ---------------- processing ----------------

type Env = AdminEnv & { ANTHROPIC_API_KEY?: string; AI_MODEL?: string }
interface QueueRow { id: number; wikidata_id: string; kind: Kind; category_slug: string | null; circuit_slug: string | null; circuit_position: number | null; place_id: number | null }

export async function processNext(env: Env, max: number) {
  // Items stuck in "processing" for 10+ minutes are retried (up to 3 attempts).
  await env.DB.prepare(`UPDATE import_queue SET status = CASE WHEN attempts >= 3 THEN 'error' ELSE 'pending' END,
    error = CASE WHEN attempts >= 3 THEN 'Timed out 3 times' ELSE error END
    WHERE status = 'processing' AND started_at < datetime('now','-3 minutes')`).run()
  let done = 0
  for (let n = 0; n < max; n++) {
    const row = await env.DB.prepare(`UPDATE import_queue SET status = 'processing', attempts = attempts + 1, started_at = datetime('now')
      WHERE id = (SELECT id FROM import_queue WHERE status = 'pending' ORDER BY id LIMIT 1)
      RETURNING id, wikidata_id, kind, category_slug, circuit_slug, circuit_position, place_id`).first<QueueRow>()
    if (!row) break
    try {
      const r = row.place_id
        ? await fillExisting(env, row.place_id, row.wikidata_id, 'importer').then((x) => ({ placeId: row.place_id, skipped: false, note: x.notes.join('; ') || `Refilled: ${x.filled.join(', ') || 'lists only'}` }))
        : await importOne(env, row)
      await env.DB.prepare("UPDATE import_queue SET status = ?, place_id = ?, error = ?, finished_at = datetime('now') WHERE id = ?")
        .bind(r.skipped ? 'skipped' : 'done', r.placeId, r.note ?? null, row.id).run()
    } catch (e) {
      await env.DB.prepare("UPDATE import_queue SET status = CASE WHEN attempts >= 3 THEN 'error' ELSE 'pending' END, error = ? WHERE id = ?")
        .bind(String((e as Error).message).slice(0, 300), row.id).run()
    }
    done++
  }
  return done
}

interface Gathered { wd: WdPlace; sug: Suggestions | null; osm: boolean; wiki: { text: string; url: string } | null; photo: Awaited<ReturnType<typeof commonsPhoto>>; ai: AiDraft | null; notes: string[] }

async function gather(env: Env, wikidataId: string, kind: Kind, wantAi: boolean): Promise<Gathered> {
  const notes: string[] = []
  const wd = await wdPlace(wikidataId)
  const hasLL = wd.lat != null && wd.lng != null
  const [wiki, photo, sug, hubs] = await Promise.all([
    wd.wikiTitle ? wikiExtract(wd.wikiTitle) : Promise.resolve(null),
    wd.image ? commonsPhoto(wd.image).catch((e) => { notes.push(`Photo lookup failed: ${(e as Error).message.slice(0, 80)}`); return null }) : Promise.resolve((notes.push('No photo on Wikidata'), null)),
    wd.lat != null && wd.lng != null
      ? overpass(wd.lat, wd.lng).then((els) => suggestions(els, [wd.lat!, wd.lng!], wd.name)).catch((e) => { notes.push((e as Error).message.slice(0, 160)); return null })
      : Promise.resolve((notes.push('No coordinates on Wikidata, so no nearby lookups'), null)),
    hasLL ? wdTransport(wd.lat!, wd.lng!).catch((e) => { notes.push(`Station lookup failed: ${(e as Error).message.slice(0, 80)}`); return [] as Hub[] }) : Promise.resolve([] as Hub[]),
  ])
  // Stations and airports (Wikidata) go first; the bus stand comes from OpenStreetMap when it answered.
  const transport = [...hubs.filter((h) => h.type === 'rail'), ...(sug?.transport ?? []), ...hubs.filter((h) => h.type === 'air')]
  const merged: Suggestions | null = sug || hubs.length ? { transport, stays: sug?.stays ?? [], eateries: sug?.eateries ?? [], nearby: sug?.nearby ?? [] } : null
  let ai: AiDraft | null = null
  if (wantAi && !env.ANTHROPIC_API_KEY) notes.push('AI off: ANTHROPIC_API_KEY secret not set')
  if (wantAi && env.ANTHROPIC_API_KEY) {
    try {
      ai = await draftWithAi(env.ANTHROPIC_API_KEY, env.AI_MODEL || 'claude-haiku-4-5-20251001', {
        name: wd.name, kind,
        location: [wd.city, wd.district, wd.state, wd.country].filter(Boolean).join(', '),
        description: wd.description, deity: wd.deity, wikipedia_extract: wiki?.text, wikidata_facts: wd.facts,
        transport: merged?.transport, nearby: merged?.nearby,
      })
    } catch (e) { notes.push(`AI draft failed: ${(e as Error).message.slice(0, 80)}`) }
  }
  if (ai) {
    const got = [ai.summary && 'summary', ai.highlights && `${ai.highlights.length} highlights`, ai.how_to_reach && 'how to reach', ai.nearby?.length && 'nearby notes'].filter(Boolean)
    notes.push(got.length ? `AI: ${got.join(', ')}` : 'AI found too little in the sources')
  }
  if (!wiki) notes.push('No English Wikipedia article')
  return { wd, sug: merged, osm: !!sug, wiki, photo, ai, notes }
}

async function storePhoto(env: Env, photo: NonNullable<Gathered['photo']>, slug: string) {
  const [big, small] = await Promise.all([download(photo.large), download(photo.small)])
  if (!big) return null
  const key = `places/${slug}/${Date.now().toString(36)}`
  await env.PHOTOS.put(`${key}-1200.webp`, big.body, { httpMetadata: { contentType: big.type } })
  await env.PHOTOS.put(`${key}-400.webp`, (small ?? big).body, { httpMetadata: { contentType: (small ?? big).type } })
  return key
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80)

function childStatements(env: Env, placeId: number, g: Gathered, only: { transport: boolean; stays: boolean; eateries: boolean; nearby: boolean; sources: boolean; website: boolean }) {
  const s: D1PreparedStatement[] = []
  const P = (sql: string, ...v: unknown[]) => s.push(env.DB.prepare(sql).bind(...v))
  if (g.sug && only.transport) g.sug.transport.forEach((t, i) => P('INSERT INTO place_transport (place_id, type, name, code, distance_km, sort) VALUES (?, ?, ?, ?, ?, ?)', placeId, t.type, t.name, t.code, t.distance_km, i))
  if (g.sug && only.stays) g.sug.stays.forEach((t, i) => P('INSERT INTO place_stays (place_id, name, type, distance_km, phone, booking_url, sort) VALUES (?, ?, ?, ?, ?, ?, ?)', placeId, t.name, t.type, t.distance_km, t.phone, t.booking_url, i))
  if (g.sug && only.eateries) g.sug.eateries.forEach((t, i) => P('INSERT INTO place_eateries (place_id, name, pure_veg, distance_km, phone, sort) VALUES (?, ?, ?, ?, ?, ?)', placeId, t.name, t.pure_veg, t.distance_km, t.phone, i))
  if (g.sug && only.nearby) g.sug.nearby.forEach((t, i) => {
    const w = g.ai?.nearby?.find((n) => n.name.toLowerCase() === t.name.toLowerCase())?.what_to_expect ?? null
    P('INSERT INTO place_nearby (place_id, name, kind, distance_km, what_to_expect, sort) VALUES (?, ?, ?, ?, ?, ?)', placeId, t.name, t.kind, t.distance_km, w, i)
  })
  if (only.website && g.wd.website) P("INSERT INTO place_contacts (place_id, type, label, value) VALUES (?, 'website', 'Official website', ?)", placeId, g.wd.website)
  if (only.sources) {
    // Wikidata, OpenStreetMap, Commons and AI are credited once, site-wide. Only the Wikipedia link is kept per place, to check AI drafts against.
    const src: [string, string | null, string][] = g.wiki ? [['wikipedia', g.wiki.url, 'Wikipedia (reference)']] : []
    src.forEach(([t, u, c], i) => P('INSERT INTO place_sources (place_id, type, url, credit, sort) VALUES (?, ?, ?, ?, ?)', placeId, t, u, c, 100 + i))
  }
  return s
}

function aiFields(g: Gathered) {
  const f: string[] = []
  if (g.ai?.summary) f.push('summary')
  if (g.ai?.highlights) f.push('highlights')
  if (g.ai?.how_to_reach) f.push('how_to_reach')
  if (g.ai?.nearby?.length) f.push('nearby')
  return f
}

async function linkExtras(env: Env, placeId: number, row: Pick<QueueRow, 'kind' | 'category_slug' | 'circuit_slug' | 'circuit_position'>) {
  const s: D1PreparedStatement[] = []
  if (row.category_slug) s.push(env.DB.prepare('INSERT OR IGNORE INTO place_categories (place_id, category_id) SELECT ?, id FROM categories WHERE kind = ? AND slug = ?').bind(placeId, row.kind, row.category_slug))
  if (row.circuit_slug) s.push(env.DB.prepare('INSERT OR IGNORE INTO place_circuits (place_id, circuit_id, position) SELECT ?, id, ? FROM circuits WHERE slug = ?').bind(placeId, row.circuit_position, row.circuit_slug))
  if (s.length) await env.DB.batch(s)
}

async function importOne(env: Env, row: QueueRow): Promise<{ placeId: number | null; skipped?: boolean; note?: string }> {
  const already = await env.DB.prepare('SELECT id FROM places WHERE wikidata_id = ?').bind(row.wikidata_id).first<number>('id')
  if (already) { await linkExtras(env, already, row); return { placeId: already, skipped: true, note: 'Already in Q-Locate' } }

  const g = await gather(env, row.wikidata_id, row.kind, true)
  const wd = g.wd
  // Same name already added by hand? Link it instead of creating a duplicate.
  const sameName = await env.DB.prepare('SELECT id FROM places WHERE lower(name) = lower(?) AND wikidata_id IS NULL').bind(wd.name).first<number>('id')
  if (sameName) {
    await env.DB.prepare('UPDATE places SET wikidata_id = ? WHERE id = ?').bind(wd.id, sameName).run()
    await linkExtras(env, sameName, row)
    return { placeId: sameName, skipped: true, note: 'Matched a place added by hand; linked it' }
  }

  let slug = slugify(`${wd.name} ${wd.state ?? wd.country ?? ''}`) || wd.id.toLowerCase()
  if (await env.DB.prepare('SELECT 1 FROM places WHERE slug = ?').bind(slug).first()) slug = `${slug}-${wd.id.toLowerCase()}`
  let cover: string | null = null
  if (g.photo) cover = await storePhoto(env, g.photo, slug).catch((e) => { g.notes.push(`Photo download failed: ${(e as Error).message.slice(0, 80)}`); return null })

  const r = await env.DB.prepare(`INSERT INTO places (kind, slug, name, alt_names, country, state, district_city, city, lat, lng, summary, highlights, how_to_reach,
      cover_photo, cover_credit, wikidata_id, needs_review, ai_pending, status, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'draft', 'importer', 'importer') RETURNING id`)
    .bind(row.kind, slug, wd.name, wd.altNames.join(', ') || null, wd.country ?? 'India', wd.state, wd.district, wd.city, wd.lat, wd.lng,
      g.ai?.summary ?? (wd.description ? wd.description.charAt(0).toUpperCase() + wd.description.slice(1) : null),
      JSON.stringify(g.ai?.highlights ?? []), g.ai?.how_to_reach ?? null, cover, cover ? g.photo!.credit : null, wd.id, JSON.stringify(aiFields(g)))
    .first<number>('id')
  const placeId = r!
  const stmts = [
    row.kind === 'vacation'
      ? env.DB.prepare('INSERT OR IGNORE INTO vacation_details (place_id) VALUES (?)').bind(placeId)
      : env.DB.prepare('INSERT OR IGNORE INTO temple_details (place_id, main_deity) VALUES (?, ?)').bind(placeId, wd.deity),
    ...childStatements(env, placeId, g, { transport: true, stays: true, eateries: true, nearby: true, sources: true, website: true }),
    env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES ('importer', 'import', 'place', ?)").bind(String(placeId)),
  ]
  await env.DB.batch(stmts)
  await linkExtras(env, placeId, row)
  return { placeId, note: g.notes.join('; ') || undefined }
}

/** "Fill from open sources" on an existing place: only empty fields and empty lists are filled. */
export async function enrichPlace(id: number, body: Record<string, unknown>, env: Env, a: Admin) {
  const p = await env.DB.prepare('SELECT kind, wikidata_id FROM places WHERE id = ?').bind(id).first<Record<string, unknown>>()
  if (!p) return json({ error: 'not_found' }, { status: 404 })
  if (a.scope !== 'all' && a.scope !== p.kind) return json({ error: 'Outside your scope' }, { status: 403 })
  const wikidataId = typeof body.wikidata_id === 'string' && /^Q\d+$/.test(body.wikidata_id) ? body.wikidata_id : (p.wikidata_id as string | null)
  if (!wikidataId) return json({ error: 'Link this place to Wikidata first' }, { status: 400 })
  const clash = await env.DB.prepare('SELECT id FROM places WHERE wikidata_id = ? AND id != ?').bind(wikidataId, id).first<number>('id')
  if (clash) return json({ error: `That Wikidata item is already linked to place #${clash}` }, { status: 400 })
  const r = await fillExisting(env, id, wikidataId, a.email)
  return json({ ok: true, ...r })
}

/** Queue existing places (that have a Wikidata link) to be refilled in the background. */
export async function enqueueRefill(body: Record<string, unknown>, env: AdminEnv, a: Admin) {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => n > 0).slice(0, 500) : []
  const stmts = ids.map((id) => env.DB.prepare(
    `INSERT INTO import_queue (wikidata_id, label, kind, place_id, queued_by)
     SELECT wikidata_id, name, kind, id, ? FROM places WHERE id = ? AND wikidata_id IS NOT NULL AND (? = 'all' OR kind = ?)
       AND NOT EXISTS (SELECT 1 FROM import_queue q WHERE q.place_id = places.id AND q.status IN ('pending','processing'))`,
  ).bind(a.email, id, a.scope, a.scope))
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50))
  return status(env)
}

async function fillExisting(env: Env, id: number, wikidataId: string, actor: string) {
  const p = (await env.DB.prepare('SELECT * FROM places WHERE id = ?').bind(id).first<Record<string, unknown>>())!
  const g = await gather(env, wikidataId, p.kind as Kind, true)
  const counts = await env.DB.batch(['place_transport', 'place_stays', 'place_eateries', 'place_nearby', 'place_sources', 'place_contacts']
    .map((t) => env.DB.prepare(`SELECT count(*) AS n FROM ${t} WHERE place_id = ?`).bind(id)))
  const empty = counts.map((c) => ((c.results[0] as { n: number }).n === 0))
  const hasHl = parseJson<string[]>(p.highlights, []).filter(Boolean).length > 0
  const pending = new Set(parseJson<string[]>(p.ai_pending, []))
  const set: Record<string, unknown> = { wikidata_id: wikidataId }
  const fill = (k: string, v: unknown) => { if ((p[k] == null || p[k] === '') && v != null && v !== '') set[k] = v }
  fill('alt_names', g.wd.altNames.join(', ') || null)
  fill('state', g.wd.state); fill('district_city', g.wd.district); fill('city', g.wd.city)
  fill('lat', g.wd.lat); fill('lng', g.wd.lng)
  // Text may be replaced when empty, still an unchecked AI draft, or written by the importer and untouched since.
  const untouched = p.updated_by === 'importer'
  const replaceable = (k: string, empty: boolean) => empty || pending.has(k) || untouched
  if (g.ai?.summary && replaceable('summary', !p.summary)) { set.summary = g.ai.summary; pending.add('summary') }
  if (g.ai?.highlights && replaceable('highlights', !hasHl)) { set.highlights = JSON.stringify(g.ai.highlights); pending.add('highlights') }
  if (g.ai?.how_to_reach && replaceable('how_to_reach', !p.how_to_reach)) { set.how_to_reach = g.ai.how_to_reach; pending.add('how_to_reach') }
  if (g.ai?.nearby?.length) pending.add('nearby')
  const nearbyNotes = empty[3] ? [] : (g.ai?.nearby ?? []).map((n) => env.DB.prepare(
    "UPDATE place_nearby SET what_to_expect = ? WHERE place_id = ? AND lower(name) = lower(?) AND (what_to_expect IS NULL OR what_to_expect = '')").bind(n.what_to_expect, id, n.name))
  if (!p.cover_photo && g.photo) {
    const key = await storePhoto(env, g.photo, String(p.slug)).catch(() => null)
    if (key) { set.cover_photo = key; set.cover_credit = g.photo.credit }
  }
  set.ai_pending = JSON.stringify([...pending])
  const cols = Object.keys(set)
  await env.DB.batch([
    env.DB.prepare(`UPDATE places SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(...cols.map((c) => set[c]), actor, id),
    ...nearbyNotes,
    ...(p.kind === 'spiritual' && g.wd.deity ? [env.DB.prepare("INSERT INTO temple_details (place_id, main_deity) VALUES (?, ?) ON CONFLICT(place_id) DO UPDATE SET main_deity = COALESCE(NULLIF(temple_details.main_deity, ''), excluded.main_deity)").bind(id, g.wd.deity)] : []),
    ...childStatements(env, id, g, { transport: empty[0], stays: empty[1], eateries: empty[2], nearby: empty[3], sources: !(await hasAutoSources(env, id)), website: empty[5] }),
    env.DB.prepare("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES (?, 'enrich', 'place', ?)").bind(actor, String(id)),
  ])
  return { filled: cols.filter((c) => c !== 'ai_pending' && c !== 'wikidata_id'), notes: g.notes }
}

async function hasAutoSources(env: Env, id: number) {
  return !!(await env.DB.prepare("SELECT 1 FROM place_sources WHERE place_id = ? AND type = 'wikipedia'").bind(id).first())
}

export async function wikidataSearch(url: URL) {
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return json({ results: [] })
  return json({ results: await wdSearch(q, 6) })
}
