import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Lookups, Me, STATUS_CLASS, STATUS_LABEL } from './api'
import { makePhotoPair } from './image'

const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const AMENITIES: [string, string][] = [['parking', 'Parking'], ['food', 'Food nearby'], ['restroom', 'Restrooms'], ['wheelchair', 'Wheelchair access'],
  ['atm', 'ATM nearby'], ['drinking_water', 'Drinking water'], ['cloakroom', 'Cloakroom / footwear stand'], ['guide', 'Guides available']]
const ACCESS: [string, string][] = [['drive_up', 'Drive up to the spot'], ['short_walk', 'Short walk (under 15 min)'], ['steps_climb', 'Steps or steep climb'], ['trek', 'Trek / long hike']]
const CONTACT_TYPES = ['phone', 'whatsapp', 'website', 'email', 'booking', 'instagram']
const TRANSPORT: [string, string][] = [['rail', 'Railway station'], ['bus', 'Bus stand'], ['air', 'Airport'], ['local', 'Local transport']]
const STAY_TYPES: [string, string][] = [['hostel', 'Hostel'], ['dorm', 'Dormitory'], ['homestay', 'Homestay / guest house'], ['budget_hotel', 'Budget hotel'],
  ['hotel', 'Hotel'], ['resort', 'Resort'], ['dharmashala', 'Dharmashala / choultry']]
const NEARBY_KINDS: [string, string][] = [['temple', 'Temple'], ['attraction', 'Attraction'], ['viewpoint', 'Viewpoint'], ['waterfall', 'Waterfall'],
  ['peak', 'Peak'], ['beach', 'Beach'], ['other', 'Other']]
const SOURCE_TYPES: [string, string][] = [['reel', 'Reel'], ['video', 'Video'], ['article', 'Article / blog'], ['official', 'Official site'], ['other', 'Other']]
const AUTO_SOURCES = new Set(['wikidata', 'wikipedia', 'osm', 'photo', 'ai'])
const FACILITIES: [string, string][] = [['retiring_room', 'Retiring rooms (paid)'], ['dormitory', 'Dormitory (paid)'], ['ac_waiting_hall', 'AC waiting hall (paid)']]

type Obj = Record<string, any>
interface FormData {
  place: Obj; details: Obj; category_ids: number[]; circuits: { circuit_id: number; position: number | '' }[]
  contacts: Obj[]; transport: Obj[]; stays: Obj[]; eateries: Obj[]; nearby: Obj[]; sources: Obj[]
}
const blank = (kind: string): FormData => ({
  place: { kind, name: '', country: 'India', highlights: ['', '', ''], amenities: [], ai_pending: [] },
  details: kind === 'spiritual' ? { darshan_hours: [] } : { best_months: '' },
  category_ids: [], circuits: [], contacts: [], transport: [], stays: [], eateries: [], nearby: [], sources: [],
})
const withHighlightSlots = (r: FormData): FormData => ({
  ...r, place: { ...r.place, highlights: [...(r.place.highlights || []), '', '', ''].slice(0, Math.max(3, (r.place.highlights || []).length)) },
})

export function parseMapsLink(text: string): [number, number] | null {
  const t = decodeURIComponent(text)
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /[?&](?:q|ll|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/]
  for (const p of pats) { const m = t.match(p); if (m) return [Number(m[1]), Number(m[2])] }
  return null
}

const inp = 'h-11 w-full rounded-lg border border-stone-300 bg-white px-3'
const area = 'w-full rounded-lg border border-stone-300 bg-white p-3 min-h-20'
const btn = 'h-11 px-4 rounded-lg font-semibold disabled:opacity-50'
const small = 'h-10 px-3 rounded-lg border border-stone-300 bg-white text-sm font-semibold'
function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-sm font-semibold ${className}`}>{label}{children}{hint && <span className="font-normal text-muted">{hint}</span>}</label>
}
function Section({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <fieldset className="border border-stone-200 rounded-xl p-4 flex flex-col gap-3 m-0 min-w-0">
      <legend className="px-1 font-display font-bold">{n}. {title}</legend>
      {aside}
      {children}
    </fieldset>
  )
}
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="self-start text-sm font-semibold text-forest" onClick={onClick}>+ {label}</button>
}
function RowCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="relative grid grid-cols-1 sm:grid-cols-6 gap-2 p-3 pr-12 rounded-lg bg-stone-50 border border-stone-200">
      {children}
      <button type="button" aria-label="Remove" onClick={onRemove} className="absolute top-2 right-2 w-9 h-9 rounded-lg border border-stone-300 bg-white">✕</button>
    </div>
  )
}

export default function PlaceForm({ me, lookups }: { me: Me; lookups: Lookups }) {
  const { id } = useParams()
  const nav = useNavigate()
  const isNew = !id
  const [d, setD] = useState<FormData | null>(isNew ? blank(me.scope === 'spiritual' ? 'spiritual' : 'vacation') : null)
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dupes, setDupes] = useState<{ id: number; name: string; state: string; status: string }[]>([])
  const [mapsText, setMapsText] = useState('')
  const [wdQuery, setWdQuery] = useState('')
  const [wdHits, setWdHits] = useState<{ id: string; label: string; description: string }[]>([])

  const load = () => api<FormData>(`/places/${id}`).then((r) => setD(withHighlightSlots(r))).catch((e) => setMsg({ text: e.message }))
  useEffect(() => { if (id) load() }, [id])

  const kind = d?.place.kind
  const cats = useMemo(() => lookups.categories.filter((c) => c.kind === kind), [lookups, kind])
  if (!d) return <p>{msg?.text ?? 'Loading…'}</p>

  const status: string = d.place.status ?? 'draft'
  const locked = !isNew && (status === 'published' || status === 'archived') && me.role === 'editor'
  const aiPending: string[] = d.place.ai_pending ?? []
  const setP = (k: string, v: unknown) => setD({ ...d, place: { ...d.place, [k]: v } })
  const setDet = (k: string, v: unknown) => setD({ ...d, details: { ...d.details, [k]: v } })
  const setList = (key: keyof FormData, list: Obj[]) => setD({ ...d, [key]: list })
  const setRow = (key: 'transport' | 'stays' | 'eateries' | 'nearby' | 'sources' | 'contacts', i: number, k: string, v: unknown) => {
    const list = [...(d[key] as Obj[])]; list[i] = { ...list[i], [k]: v }; setList(key, list)
  }
  const removeRow = (key: 'transport' | 'stays' | 'eateries' | 'nearby' | 'sources' | 'contacts', i: number) => setList(key, (d[key] as Obj[]).filter((_, j) => j !== i))
  const months: number[] = String(d.details.best_months ?? '').split(',').filter(Boolean).map(Number)
  const abroad = d.place.country !== 'India'

  const AiBadge = ({ field }: { field: string }) => aiPending.includes(field) ? (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-sm">
      <span className="font-semibold text-amber-900">AI draft — check against the sources before publishing</span>
      <button type="button" disabled={locked} className="ml-auto h-9 px-3 rounded-lg bg-white border border-amber-300 font-semibold" onClick={() => setP('ai_pending', aiPending.filter((f) => f !== field))}>I've checked it</button>
    </div>
  ) : null

  const checkDupes = async () => {
    if (!d.place.name || d.place.name.length < 3) return
    const p = new URLSearchParams({ name: d.place.name, state: d.place.state ?? '', exclude: String(id ?? 0) })
    setDupes((await api<{ matches: typeof dupes }>(`/duplicates?${p}`)).matches)
  }
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const body = { ...d, place: { ...d.place, highlights: (d.place.highlights as string[]).map((h) => h.trim()).filter(Boolean) } }
      const r = await api<FormData>(isNew ? '/places' : `/places/${id}`, { method: isNew ? 'POST' : 'PUT', json: body })
      setMsg({ text: 'Saved.', ok: true })
      if (isNew) nav(`/admin/places/${r.place.id}`, { replace: true })
      else setD(withHighlightSlots(r))
      return true
    } catch (e) { setMsg({ text: (e as Error).message }); return false } finally { setBusy(false) }
  }
  const changeStatus = async (s: string) => {
    if (!(await save())) return
    setBusy(true)
    try { await api(`/places/${id}/status`, { method: 'POST', json: { status: s } }); setD((cur) => cur && { ...cur, place: { ...cur.place, status: s } }); setMsg({ text: `Now ${STATUS_LABEL[s]}.`, ok: true }) }
    catch (e) { setMsg({ text: (e as Error).message }) } finally { setBusy(false) }
  }
  const verify = async () => {
    try { await api(`/places/${id}/verify`, { method: 'POST' }); setP('verified_on', new Date().toISOString().slice(0, 10)); setMsg({ text: 'Marked as verified today.', ok: true }) }
    catch (e) { setMsg({ text: (e as Error).message }) }
  }
  const onPhoto = async (file?: File) => {
    if (!file) return
    setBusy(true); setMsg({ text: 'Preparing photo…', ok: true })
    try {
      const { large, small: sm } = await makePhotoPair(file)
      const fd = new FormData()
      fd.append('large', large, 'large.webp'); fd.append('small', sm, 'small.webp'); fd.append('slug', d.place.slug ?? 'new')
      const r = await api<{ key: string }>('/upload', { method: 'POST', body: fd })
      setD({ ...d, place: { ...d.place, cover_photo: r.key, cover_credit: '' } }); setMsg({ text: 'Photo uploaded. Add a credit if it is not yours, then Save.', ok: true })
    } catch (e) { setMsg({ text: (e as Error).message }) } finally { setBusy(false) }
  }
  const searchWd = async () => {
    if (wdQuery.trim().length < 2) return
    try { setWdHits((await api<{ results: typeof wdHits }>(`/wikidata/search?q=${encodeURIComponent(wdQuery)}`)).results) }
    catch (e) { setMsg({ text: (e as Error).message }) }
  }
  const enrich = async (wikidataId?: string) => {
    if (!(await save())) return
    setBusy(true); setMsg({ text: 'Fetching from Wikidata, Wikipedia, Commons and OpenStreetMap, then drafting with AI… (up to a minute)', ok: true })
    try {
      const r = await api<{ filled: string[]; notes: string[] }>(`/places/${id}/enrich`, { method: 'POST', json: { wikidata_id: wikidataId } })
      await load(); setWdHits([])
      setMsg({ text: `Filled: ${r.filled.join(', ').replace(/_/g, ' ') || 'lists only'}. Empty lists were filled too.${r.notes.length ? ' Note: ' + r.notes.join('; ') : ''}`, ok: true })
    } catch (e) { setMsg({ text: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <form className="flex flex-col gap-4 pb-28" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/admin" className="text-sm">← Places</Link>
        <h1 className="m-0 w-full font-display text-2xl font-bold">{isNew ? 'Add a place' : d.place.name || 'Untitled'}</h1>
        {!isNew && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>}
        {!isNew && d.place.needs_review ? <span className="text-xs font-semibold px-2 py-1 rounded-full bg-sky-100 text-sky-900">Imported — needs review</span> : null}
        {!isNew && <span className="text-sm text-muted">Last verified: {d.place.verified_on ?? 'never'}</span>}
      </div>
      {locked && <p className="m-0 p-3 rounded-lg bg-amber-50 text-amber-900">This place is {STATUS_LABEL[status].toLowerCase()}. Only a publisher or owner can change it.</p>}
      {aiPending.length > 0 && <p className="m-0 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">AI drafts to check before publishing: <b>{aiPending.join(', ').replace(/_/g, ' ')}</b>.</p>}

      <fieldset disabled={locked} className="contents">
        <Section n={1} title="Location">
          {isNew && me.scope === 'all' && (
            <div className="flex gap-2" role="radiogroup" aria-label="Tab">
              {[['vacation', 'Explore (vacation)'], ['spiritual', 'Darshan (spiritual)']].map(([k, l]) => (
                <button type="button" key={k} role="radio" aria-checked={kind === k} onClick={() => setD({ ...blank(k), place: { ...blank(k).place, name: d.place.name } })}
                  className={`${btn} border ${kind === k ? 'bg-forest text-white border-forest' : 'bg-white border-stone-300'}`}>{l}</button>
              ))}
            </div>
          )}
          <Field label="Location name *"><input className={inp} required value={d.place.name ?? ''} onChange={(e) => setP('name', e.target.value)} onBlur={checkDupes} /></Field>
          {dupes.length > 0 && <p className="m-0 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">Possible duplicate: {dupes.map((x) => <Link key={x.id} to={`/admin/places/${x.id}`} className="mr-2">{x.name} ({x.state}, {STATUS_LABEL[x.status]})</Link>)}</p>}
          <Field label="Other names / spellings" hint="Comma separated. Helps search, e.g. Ooty, Udhagamandalam, Udagai"><input className={inp} value={d.place.alt_names ?? ''} onChange={(e) => setP('alt_names', e.target.value)} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="Where"><select className={inp} value={abroad ? 'abroad' : 'India'} onChange={(e) => setP('country', e.target.value === 'India' ? 'India' : '')}><option value="India">India</option><option value="abroad">International</option></select></Field>
            {abroad
              ? <Field label="Country *"><input className={inp} value={d.place.country ?? ''} onChange={(e) => setP('country', e.target.value)} /></Field>
              : <Field label="State / UT *"><select className={inp} value={d.place.state ?? ''} onChange={(e) => setP('state', e.target.value)} onBlur={checkDupes}><option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>}
            {abroad
              ? <Field label="Region / state"><input className={inp} value={d.place.state ?? ''} onChange={(e) => setP('state', e.target.value)} /></Field>
              : <Field label="District"><input className={inp} value={d.place.district_city ?? ''} onChange={(e) => setP('district_city', e.target.value)} /></Field>}
            <Field label="City / place"><input className={inp} value={d.place.city ?? ''} onChange={(e) => setP('city', e.target.value)} /></Field>
          </div>
          <div className="flex flex-col gap-1 text-sm font-semibold">Categories *
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => {
                const on = d.category_ids.includes(c.id)
                return <button type="button" key={c.id} aria-pressed={on} onClick={() => setD({ ...d, category_ids: on ? d.category_ids.filter((x) => x !== c.id) : [...d.category_ids, c.id] })}
                  className={`h-10 px-3 rounded-full border font-semibold ${on ? 'bg-forest text-white border-forest' : 'bg-white border-stone-300'}`}>{c.name}</button>
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-sky-50 border border-sky-200">
            <span className="text-sm font-semibold">Open sources {d.place.wikidata_id && <a href={`https://www.wikidata.org/wiki/${d.place.wikidata_id}`} target="_blank" rel="noreferrer" className="font-normal">· linked to {d.place.wikidata_id} ↗</a>}</span>
            {isNew ? <span className="text-sm text-muted">Save the place first, then you can fill it from open sources.</span> : d.place.wikidata_id ? (
              <button type="button" disabled={busy} className={`${small} self-start`} onClick={() => enrich()}>Fill empty fields from open sources + AI</button>
            ) : (
              <>
                <div className="flex gap-2">
                  <input aria-label="Search Wikidata" className={inp} placeholder="Search Wikidata, e.g. Kodaikanal" value={wdQuery} onChange={(e) => setWdQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchWd() } }} />
                  <button type="button" className={small} onClick={searchWd}>Search</button>
                </div>
                {wdHits.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1"><b>{h.label}</b> — {h.description || 'no description'} <a href={`https://www.wikidata.org/wiki/${h.id}`} target="_blank" rel="noreferrer">{h.id} ↗</a></span>
                    <button type="button" disabled={busy} className={small} onClick={() => enrich(h.id)}>Use this and fill</button>
                  </div>
                ))}
              </>
            )}
          </div>
        </Section>

        <Section n={2} title="Cover photo *">
          {d.place.cover_photo && <img src={`/img/${d.place.cover_photo}-1200.webp`} alt="Cover" className="w-full max-w-md rounded-xl object-cover aspect-video" />}
          <Field label={d.place.cover_photo ? 'Replace photo' : 'Choose photo'} hint="Your own photo, or one you have permission to use. Resized automatically.">
            <input type="file" accept="image/*" disabled={busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
          </Field>
          <Field label="Photo credit" hint="Shown under the photo, e.g. Photo: @creator, or the Commons author and licence"><input className={inp} value={d.place.cover_credit ?? ''} onChange={(e) => setP('cover_credit', e.target.value)} /></Field>
        </Section>

        <Section n={3} title="Summary" aside={<AiBadge field="summary" />}>
          <Field label="One or two lines" hint="Facts, not opinions. Shown on cards and at the top of the page."><textarea className={area} maxLength={260} value={d.place.summary ?? ''} onChange={(e) => setP('summary', e.target.value)} /></Field>
        </Section>

        <Section n={4} title="Highlights (3–5 short facts) *" aside={<AiBadge field="highlights" />}>
          {(d.place.highlights as string[]).map((h, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Highlight ${i + 1}`} className={inp} maxLength={100} placeholder={i < 3 ? 'Required' : 'Optional'} value={h}
                onChange={(e) => { const hs = [...d.place.highlights]; hs[i] = e.target.value; setP('highlights', hs) }} />
              {i >= 3 && <button type="button" aria-label="Remove highlight" className={small} onClick={() => setP('highlights', d.place.highlights.filter((_: string, j: number) => j !== i))}>✕</button>}
            </div>
          ))}
          {d.place.highlights.length < 5 && <AddButton label="Add highlight" onClick={() => setP('highlights', [...d.place.highlights, ''])} />}
        </Section>

        <Section n={5} title="Travel / logistics">
          <p className="m-0 text-sm text-muted">Distances are approximate. Station facilities show users: “Retiring rooms / dormitory can be booked only with a confirmed ticket (IRCTC)” and “AC waiting hall subject to availability on arrival”.</p>
          {d.transport.map((t, i) => (
            <RowCard key={i} onRemove={() => removeRow('transport', i)}>
              <Field label="Type"><select className={inp} value={t.type} onChange={(e) => setRow('transport', i, 'type', e.target.value)}>{TRANSPORT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              {t.type !== 'local' && <Field label="Name" className="sm:col-span-2"><input className={inp} value={t.name ?? ''} onChange={(e) => setRow('transport', i, 'name', e.target.value)} /></Field>}
              {(t.type === 'rail' || t.type === 'air') && <Field label={t.type === 'rail' ? 'Station code' : 'Airport code'}><input className={inp} value={t.code ?? ''} onChange={(e) => setRow('transport', i, 'code', e.target.value.toUpperCase())} /></Field>}
              {t.type !== 'local' && <Field label="Distance (km)"><input className={inp} inputMode="decimal" value={t.distance_km ?? ''} onChange={(e) => setRow('transport', i, 'distance_km', e.target.value)} /></Field>}
              {t.type === 'rail' && (
                <div className="sm:col-span-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {FACILITIES.map(([k, l]) => <label key={k} className="flex items-center gap-2 min-h-11"><input type="checkbox" className="w-5 h-5" checked={!!t.facilities?.[k]}
                    onChange={(e) => setRow('transport', i, 'facilities', { ...(t.facilities ?? {}), [k]: e.target.checked })} />{l}</label>)}
                </div>
              )}
              <Field label={t.type === 'local' ? 'Local transport notes' : 'Notes'} className="sm:col-span-6"><input className={inp} placeholder={t.type === 'local' ? 'e.g. Share autos from the bus stand, about ₹20' : ''} value={t.notes ?? ''} onChange={(e) => setRow('transport', i, 'notes', e.target.value)} /></Field>
            </RowCard>
          ))}
          <AddButton label="Add station / bus stand / airport / local transport" onClick={() => setList('transport', [...d.transport, { type: 'rail', facilities: {} }])} />
        </Section>

        <Section n={6} title="How to reach" aside={<AiBadge field="how_to_reach" />}>
          <textarea className={area} aria-label="How to reach" value={d.place.how_to_reach ?? ''} onChange={(e) => setP('how_to_reach', e.target.value)} />
        </Section>

        <Section n={7} title="Stay options">
          <p className="m-0 text-sm text-muted">Users see: “Listed, not endorsed. Prices may vary at the time of your arrival.” Partner listings show a “Partner” label and are shown first.</p>
          {d.stays.map((s, i) => (
            <RowCard key={i} onRemove={() => removeRow('stays', i)}>
              <Field label="Name" className="sm:col-span-3"><input className={inp} value={s.name ?? ''} onChange={(e) => setRow('stays', i, 'name', e.target.value)} /></Field>
              <Field label="Type" className="sm:col-span-2"><select className={inp} value={s.type ?? ''} onChange={(e) => setRow('stays', i, 'type', e.target.value)}><option value="">Choose…</option>{STAY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Distance (km)"><input className={inp} inputMode="decimal" value={s.distance_km ?? ''} onChange={(e) => setRow('stays', i, 'distance_km', e.target.value)} /></Field>
              <Field label="From (₹ / night)" className="sm:col-span-2"><input className={inp} inputMode="numeric" value={s.price_from ?? ''} onChange={(e) => setRow('stays', i, 'price_from', e.target.value)} /></Field>
              <Field label="Price checked on" className="sm:col-span-2"><input type="date" className={inp} value={s.price_checked_on ?? ''} onChange={(e) => setRow('stays', i, 'price_checked_on', e.target.value)} /></Field>
              <Field label="Phone" className="sm:col-span-2"><input className={inp} value={s.phone ?? ''} onChange={(e) => setRow('stays', i, 'phone', e.target.value)} /></Field>
              <Field label="Booking link / website" className="sm:col-span-5"><input className={inp} type="url" value={s.booking_url ?? ''} onChange={(e) => setRow('stays', i, 'booking_url', e.target.value)} /></Field>
              {me.role === 'owner' && <label className="flex items-center gap-2 min-h-11 text-sm self-end"><input type="checkbox" className="w-5 h-5" checked={!!s.is_partner} onChange={(e) => setRow('stays', i, 'is_partner', e.target.checked)} />Partner</label>}
            </RowCard>
          ))}
          <AddButton label="Add stay" onClick={() => setList('stays', [...d.stays, { currency: 'INR' }])} />
        </Section>

        <Section n={8} title="Nearby eateries">
          {d.eateries.map((s, i) => (
            <RowCard key={i} onRemove={() => removeRow('eateries', i)}>
              <Field label="Name" className="sm:col-span-3"><input className={inp} value={s.name ?? ''} onChange={(e) => setRow('eateries', i, 'name', e.target.value)} /></Field>
              <Field label="Distance (km)"><input className={inp} inputMode="decimal" value={s.distance_km ?? ''} onChange={(e) => setRow('eateries', i, 'distance_km', e.target.value)} /></Field>
              <Field label="Phone" className="sm:col-span-2"><input className={inp} value={s.phone ?? ''} onChange={(e) => setRow('eateries', i, 'phone', e.target.value)} /></Field>
              <label className="flex items-center gap-2 min-h-11 text-sm"><input type="checkbox" className="w-5 h-5" checked={!!s.pure_veg} onChange={(e) => setRow('eateries', i, 'pure_veg', e.target.checked)} />Pure veg</label>
              {me.role === 'owner' && <label className="flex items-center gap-2 min-h-11 text-sm"><input type="checkbox" className="w-5 h-5" checked={!!s.is_partner} onChange={(e) => setRow('eateries', i, 'is_partner', e.target.checked)} />Partner</label>}
            </RowCard>
          ))}
          <AddButton label="Add eatery" onClick={() => setList('eateries', [...d.eateries, {}])} />
        </Section>

        <Section n={9} title="Nearby places" aside={<AiBadge field="nearby" />}>
          <p className="m-0 text-sm text-muted">Temples and sights nearby. Churches and mosques are not listed.</p>
          {d.nearby.map((s, i) => (
            <RowCard key={i} onRemove={() => removeRow('nearby', i)}>
              <Field label="Name" className="sm:col-span-3"><input className={inp} value={s.name ?? ''} onChange={(e) => setRow('nearby', i, 'name', e.target.value)} /></Field>
              <Field label="Kind" className="sm:col-span-2"><select className={inp} value={s.kind ?? ''} onChange={(e) => setRow('nearby', i, 'kind', e.target.value)}><option value="">Choose…</option>{NEARBY_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Distance (km)"><input className={inp} inputMode="decimal" value={s.distance_km ?? ''} onChange={(e) => setRow('nearby', i, 'distance_km', e.target.value)} /></Field>
              <Field label="What to expect" className="sm:col-span-6"><input className={inp} maxLength={120} value={s.what_to_expect ?? ''} onChange={(e) => setRow('nearby', i, 'what_to_expect', e.target.value)} /></Field>
            </RowCard>
          ))}
          <AddButton label="Add nearby place" onClick={() => setList('nearby', [...d.nearby, {}])} />
        </Section>

        <Section n={10} title="Location and access">
          <Field label="Paste a Google Maps link or coordinates" hint="On Google Maps, long-press or right-click the spot, copy the numbers, paste here.">
            <div className="flex gap-2">
              <input className={inp} value={mapsText} onChange={(e) => setMapsText(e.target.value)} />
              <button type="button" className={`${btn} border border-stone-300 bg-white`} onClick={() => { const c = parseMapsLink(mapsText); if (c) { setD({ ...d, place: { ...d.place, lat: c[0], lng: c[1] } }); setMapsText('') } else setMsg({ text: 'Could not read coordinates. Paste numbers like 10.2381, 77.4892.' }) }}>Use</button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude"><input className={inp} inputMode="decimal" value={d.place.lat ?? ''} onChange={(e) => setP('lat', e.target.value)} /></Field>
            <Field label="Longitude"><input className={inp} inputMode="decimal" value={d.place.lng ?? ''} onChange={(e) => setP('lng', e.target.value)} /></Field>
          </div>
          {d.place.lat && d.place.lng && <a href={`https://www.google.com/maps/search/?api=1&query=${d.place.lat},${d.place.lng}`} target="_blank" rel="noreferrer" className="text-sm">Check this spot on Google Maps ↗</a>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Access effort"><select className={inp} value={d.place.access_effort ?? ''} onChange={(e) => setP('access_effort', e.target.value)}><option value="">Choose…</option>{ACCESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Access notes" hint="e.g. ~600 steps; winch and rope car available"><input className={inp} value={d.place.access_notes ?? ''} onChange={(e) => setP('access_notes', e.target.value)} /></Field>
            <Field label="Entry fee"><input className={inp} value={d.place.entry_fee ?? ''} onChange={(e) => setP('entry_fee', e.target.value)} /></Field>
            {kind === 'vacation' && <Field label="Opening hours"><input className={inp} value={d.place.timings ?? ''} onChange={(e) => setP('timings', e.target.value)} /></Field>}
          </div>
        </Section>

        <Section n={11} title="Amenities">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {AMENITIES.map(([k, l]) => <label key={k} className="flex items-center gap-2 min-h-11"><input type="checkbox" className="w-5 h-5" checked={(d.place.amenities as string[]).includes(k)}
              onChange={(e) => setP('amenities', e.target.checked ? [...d.place.amenities, k] : d.place.amenities.filter((x: string) => x !== k))} />{l}</label>)}
          </div>
          <Field label="Amenity notes"><textarea className={area} value={d.place.amenities_notes ?? ''} onChange={(e) => setP('amenities_notes', e.target.value)} /></Field>
        </Section>

        {kind === 'vacation' ? (
          <Section n={12} title="Explore details">
            <div className="flex flex-col gap-1 text-sm font-semibold">Best months to visit
              <div className="flex flex-wrap gap-2">
                {MONTHS.map((m, i) => { const on = months.includes(i + 1); return <button type="button" key={m} aria-pressed={on} onClick={() => setDet('best_months', (on ? months.filter((x) => x !== i + 1) : [...months, i + 1]).sort((a, b) => a - b).join(','))}
                  className={`h-10 w-14 rounded-lg border font-semibold ${on ? 'bg-forest text-white border-forest' : 'bg-white border-stone-300'}`}>{m}</button> })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Typical visit"><select className={inp} value={d.details.typical_visit ?? ''} onChange={(e) => setDet('typical_visit', e.target.value)}><option value="">Choose…</option><option value="few_hours">A few hours</option><option value="1_day">1 day</option><option value="2_3_days">2–3 days</option><option value="week_plus">A week or more</option></select></Field>
              <Field label="Trek grade (treks only)"><select className={inp} value={d.details.trek_grade ?? ''} onChange={(e) => setDet('trek_grade', e.target.value)}><option value="">Not a trek</option><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select></Field>
            </div>
            <Field label="Trek notes"><input className={inp} value={d.details.trek_notes ?? ''} onChange={(e) => setDet('trek_notes', e.target.value)} /></Field>
          </Section>
        ) : (
          <Section n={12} title="Darshan details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Main deity"><input className={inp} value={d.details.main_deity ?? ''} onChange={(e) => setDet('main_deity', e.target.value)} /></Field>
              <Field label="Tradition" hint="e.g. Shaiva, Vaishnava, Shakta, Jain, Sikh, Buddhist"><input className={inp} value={d.details.tradition ?? ''} onChange={(e) => setDet('tradition', e.target.value)} /></Field>
            </div>
            <Field label="Significance"><input className={inp} value={d.details.significance ?? ''} onChange={(e) => setDet('significance', e.target.value)} /></Field>
            <div className="flex flex-col gap-2 text-sm font-semibold">Darshan hours
              {(d.details.darshan_hours as { open: string; close: string }[]).map((s, i) => (
                <div key={i} className="flex items-center gap-2 font-normal">
                  <input type="time" aria-label="Opens" className={inp} value={s.open} onChange={(e) => { const hs = [...d.details.darshan_hours]; hs[i] = { ...s, open: e.target.value }; setDet('darshan_hours', hs) }} />
                  <span>to</span>
                  <input type="time" aria-label="Closes" className={inp} value={s.close} onChange={(e) => { const hs = [...d.details.darshan_hours]; hs[i] = { ...s, close: e.target.value }; setDet('darshan_hours', hs) }} />
                  <button type="button" aria-label="Remove session" className={small} onClick={() => setDet('darshan_hours', d.details.darshan_hours.filter((_: unknown, j: number) => j !== i))}>✕</button>
                </div>
              ))}
              <AddButton label="Add session" onClick={() => setDet('darshan_hours', [...d.details.darshan_hours, { open: '06:00', close: '12:00' }])} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Dress code"><input className={inp} value={d.details.dress_code ?? ''} onChange={(e) => setDet('dress_code', e.target.value)} /></Field>
              <Field label="Photography"><input className={inp} value={d.details.photography ?? ''} onChange={(e) => setDet('photography', e.target.value)} /></Field>
              <Field label="Main festivals"><input className={inp} value={d.details.festivals ?? ''} onChange={(e) => setDet('festivals', e.target.value)} /></Field>
              <Field label="Prasadam"><input className={inp} value={d.details.prasadam ?? ''} onChange={(e) => setDet('prasadam', e.target.value)} /></Field>
            </div>
            <Field label="Pooja / darshan booking link"><input className={inp} type="url" value={d.details.pooja_booking_url ?? ''} onChange={(e) => setDet('pooja_booking_url', e.target.value)} /></Field>
            <div className="flex flex-col gap-2 text-sm font-semibold">Temple circuits
              {d.circuits.map((c, i) => (
                <div key={i} className="flex items-center gap-2 font-normal">
                  <select aria-label="Circuit" className={inp} value={c.circuit_id} onChange={(e) => { const cs = [...d.circuits]; cs[i] = { ...c, circuit_id: Number(e.target.value) }; setD({ ...d, circuits: cs }) }}>
                    {lookups.circuits.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                  <input aria-label="Number in circuit" placeholder="No." className={`${inp} w-24`} inputMode="numeric" value={c.position} onChange={(e) => { const cs = [...d.circuits]; cs[i] = { ...c, position: e.target.value === '' ? '' : Number(e.target.value) }; setD({ ...d, circuits: cs }) }} />
                  <button type="button" aria-label="Remove circuit" className={small} onClick={() => setD({ ...d, circuits: d.circuits.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <AddButton label="Add to a circuit" onClick={() => setD({ ...d, circuits: [...d.circuits, { circuit_id: lookups.circuits[0].id, position: '' }] })} />
            </div>
          </Section>
        )}

        <Section n={13} title="Contacts">
          <p className="m-0 text-sm text-muted">Official numbers only (temple office, tourism office, forest department).</p>
          {d.contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[8rem_1fr] sm:grid-cols-[9rem_12rem_1fr_auto] gap-2 items-center">
              <select aria-label="Type" className={inp} value={c.type} onChange={(e) => setRow('contacts', i, 'type', e.target.value)}>{CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <input aria-label="Label" placeholder="Label, e.g. Temple office" className={inp} value={c.label ?? ''} onChange={(e) => setRow('contacts', i, 'label', e.target.value)} />
              <input aria-label="Number or link" placeholder={c.type === 'phone' || c.type === 'whatsapp' ? '+91 …' : 'https://…'} className={inp} value={c.value} onChange={(e) => setRow('contacts', i, 'value', e.target.value)} />
              <button type="button" aria-label="Remove contact" className={small} onClick={() => removeRow('contacts', i)}>✕</button>
            </div>
          ))}
          <AddButton label="Add contact" onClick={() => setList('contacts', [...d.contacts, { type: 'phone', label: '', value: '' }])} />
        </Section>

        <Section n={14} title="Sources, credits and search words">
          <p className="m-0 text-sm text-muted">Credit the creators and sources specific to this place. Wikidata, OpenStreetMap, Wikimedia Commons, Wikipedia and AI assistance are credited once for the whole app, and the photo credit is in section 2.</p>
          {(d.place.wikidata_id || d.sources.some((s) => AUTO_SOURCES.has(s.type))) && (
            <p className="m-0 text-sm">For checking: {d.place.wikidata_id && <a href={`https://www.wikidata.org/wiki/${d.place.wikidata_id}`} target="_blank" rel="noreferrer" className="mr-3">Wikidata ↗</a>}
              {d.sources.filter((s) => s.type === 'wikipedia' && s.url).map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="mr-3">Wikipedia ↗</a>)}</p>
          )}
          {d.sources.map((s, i) => AUTO_SOURCES.has(s.type) ? null : (
            <RowCard key={i} onRemove={() => removeRow('sources', i)}>
              <Field label="Type"><select className={inp} value={s.type} onChange={(e) => setRow('sources', i, 'type', e.target.value)}>{SOURCE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Link" className="sm:col-span-3"><input className={inp} type="url" value={s.url ?? ''} onChange={(e) => setRow('sources', i, 'url', e.target.value)} /></Field>
              <Field label="Creator handle" className="sm:col-span-2"><input className={inp} placeholder="@creator" value={s.creator_handle ?? ''} onChange={(e) => setRow('sources', i, 'creator_handle', e.target.value)} /></Field>
              <Field label="Credit line" className="sm:col-span-6"><input className={inp} value={s.credit ?? ''} onChange={(e) => setRow('sources', i, 'credit', e.target.value)} /></Field>
            </RowCard>
          ))}
          <AddButton label="Add source" onClick={() => setList('sources', [...d.sources, { type: 'reel' }])} />
          <Field label="Search words (tags)" hint="Extra words, comma separated: sunrise, trekking, boating"><input className={inp} value={d.place.tags ?? ''} onChange={(e) => setP('tags', e.target.value)} /></Field>
        </Section>
      </fieldset>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-2 px-4 py-3">
          {msg && <span role="status" className={`text-sm mr-auto ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</span>}
          {!locked && <button type="submit" disabled={busy} className={`${btn} bg-forest text-white ml-auto`}>Save</button>}
          {!isNew && !locked && me.role === 'editor' && status === 'draft' && <button type="button" disabled={busy} className={`${btn} border border-forest text-forest bg-white`} onClick={() => changeStatus('review')}>Send for review</button>}
          {!isNew && me.role !== 'editor' && status !== 'published' && <button type="button" disabled={busy} className={`${btn} bg-saffron text-maroon`} onClick={() => changeStatus('published')}>Publish</button>}
          {!isNew && me.role !== 'editor' && status === 'published' && <button type="button" disabled={busy} className={`${btn} border border-stone-300 bg-white`} onClick={() => changeStatus('draft')}>Unpublish</button>}
          {!isNew && me.role !== 'editor' && status !== 'archived' && <button type="button" disabled={busy} className={`${btn} border border-stone-300 bg-white`} onClick={() => changeStatus('archived')}>Archive</button>}
          {!isNew && !locked && <button type="button" disabled={busy} className={`${btn} border border-stone-300 bg-white`} onClick={verify}>Verified today</button>}
        </div>
      </div>
    </form>
  )
}
