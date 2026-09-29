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

type Obj = Record<string, any>
interface FormData { place: Obj; details: Obj; category_ids: number[]; circuits: { circuit_id: number; position: number | '' }[]; contacts: { type: string; label: string; value: string }[] }
const blank = (kind: string): FormData => ({
  place: { kind, name: '', country: 'India', highlights: ['', '', ''], amenities: [] },
  details: kind === 'spiritual' ? { darshan_hours: [] } : { best_months: '' },
  category_ids: [], circuits: [], contacts: [],
})

export function parseMapsLink(text: string): [number, number] | null {
  const t = decodeURIComponent(text)
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /[?&](?:q|ll|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/]
  for (const p of pats) { const m = t.match(p); if (m) return [Number(m[1]), Number(m[2])] }
  return null
}

const inp = 'h-11 w-full rounded-lg border border-stone-300 bg-white px-3'
const area = 'w-full rounded-lg border border-stone-300 bg-white p-3 min-h-20'
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-sm font-semibold">{label}{children}{hint && <span className="font-normal text-muted">{hint}</span>}</label>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="border border-stone-200 rounded-xl p-4 flex flex-col gap-3 m-0"><legend className="px-1 font-display font-bold">{title}</legend>{children}</fieldset>
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

  useEffect(() => {
    if (!id) return
    api<FormData>(`/places/${id}`).then((r) => setD({
      ...r,
      place: { ...r.place, highlights: [...(r.place.highlights || []), '', '', ''].slice(0, Math.max(3, (r.place.highlights || []).length)) },
    })).catch((e) => setMsg({ text: e.message }))
  }, [id])

  const kind = d?.place.kind
  const cats = useMemo(() => lookups.categories.filter((c) => c.kind === kind), [lookups, kind])
  if (!d) return <p>{msg?.text ?? 'Loading…'}</p>

  const status: string = d.place.status ?? 'draft'
  const locked = !isNew && (status === 'published' || status === 'archived') && me.role === 'editor'
  const setP = (k: string, v: unknown) => setD({ ...d, place: { ...d.place, [k]: v } })
  const setDet = (k: string, v: unknown) => setD({ ...d, details: { ...d.details, [k]: v } })
  const months: number[] = String(d.details.best_months ?? '').split(',').filter(Boolean).map(Number)
  const abroad = d.place.country && d.place.country !== 'India'

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
      else setD({ ...r, place: { ...r.place, highlights: [...r.place.highlights, '', '', ''].slice(0, Math.max(3, r.place.highlights.length)) } })
      return true
    } catch (e) { setMsg({ text: (e as Error).message }); return false } finally { setBusy(false) }
  }
  const changeStatus = async (s: string) => {
    if (!(await save())) return
    setBusy(true)
    try { await api(`/places/${id}/status`, { method: 'POST', json: { status: s } }); setP('status', s); setD((cur) => cur && { ...cur, place: { ...cur.place, status: s } }); setMsg({ text: `Now ${STATUS_LABEL[s]}.`, ok: true }) }
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
      const { large, small } = await makePhotoPair(file)
      const fd = new FormData()
      fd.append('large', large, 'large.webp'); fd.append('small', small, 'small.webp'); fd.append('slug', d.place.slug ?? 'new')
      const r = await api<{ key: string }>('/upload', { method: 'POST', body: fd })
      setP('cover_photo', r.key); setMsg({ text: 'Photo uploaded. Remember to Save.', ok: true })
    } catch (e) { setMsg({ text: (e as Error).message }) } finally { setBusy(false) }
  }

  const btn = 'h-11 px-4 rounded-lg font-semibold disabled:opacity-50'
  return (
    <form className="flex flex-col gap-4 pb-28" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/admin" className="text-sm">← Places</Link>
        <h1 className="m-0 w-full font-display text-2xl font-bold">{isNew ? 'Add a place' : d.place.name || 'Untitled'}</h1>
        {!isNew && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>}
        {!isNew && <span className="text-sm text-muted">Last verified: {d.place.verified_on ?? 'never'}</span>}
      </div>
      {locked && <p className="m-0 p-3 rounded-lg bg-amber-50 text-amber-900">This place is {STATUS_LABEL[status].toLowerCase()}. Only a publisher or owner can change it.</p>}

      <fieldset disabled={locked} className="contents">
        <Section title="Basics">
          {isNew && me.scope === 'all' && (
            <div className="flex gap-2" role="radiogroup" aria-label="Tab">
              {[['vacation', 'Explore (vacation)'], ['spiritual', 'Darshan (spiritual)']].map(([k, l]) => (
                <button type="button" key={k} role="radio" aria-checked={kind === k} onClick={() => setD({ ...blank(k), place: { ...blank(k).place, name: d.place.name } })}
                  className={`${btn} border ${kind === k ? 'bg-forest text-white border-forest' : 'bg-white border-stone-300'}`}>{l}</button>
              ))}
            </div>
          )}
          <Field label="Name *"><input className={inp} required value={d.place.name ?? ''} onChange={(e) => setP('name', e.target.value)} onBlur={checkDupes} /></Field>
          {dupes.length > 0 && <p className="m-0 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">Possible duplicate: {dupes.map((x) => <Link key={x.id} to={`/admin/places/${x.id}`} className="mr-2">{x.name} ({x.state}, {STATUS_LABEL[x.status]})</Link>)}</p>}
          <Field label="Other names / spellings" hint="Comma separated. Helps search, e.g. Ooty, Udhagamandalam, Udagai"><input className={inp} value={d.place.alt_names ?? ''} onChange={(e) => setP('alt_names', e.target.value)} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Where"><select className={inp} value={abroad ? 'abroad' : 'India'} onChange={(e) => setP('country', e.target.value === 'India' ? 'India' : '')}><option value="India">India</option><option value="abroad">Outside India</option></select></Field>
            {abroad || d.place.country === ''
              ? <Field label="Country *"><input className={inp} value={d.place.country ?? ''} onChange={(e) => setP('country', e.target.value)} /></Field>
              : <Field label="State / UT *"><select className={inp} value={d.place.state ?? ''} onChange={(e) => setP('state', e.target.value)} onBlur={checkDupes}><option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>}
            <Field label={abroad || d.place.country === '' ? 'Region / city' : 'District / city'}><input className={inp} value={d.place.district_city ?? ''} onChange={(e) => setP('district_city', e.target.value)} /></Field>
          </div>
          <Field label="One-line summary" hint="Shown on cards. Facts, not opinions."><input className={inp} maxLength={120} value={d.place.summary ?? ''} onChange={(e) => setP('summary', e.target.value)} /></Field>
          <div className="flex flex-col gap-1 text-sm font-semibold">Categories *
            <div className="flex flex-wrap gap-2">
              {cats.map((c) => {
                const on = d.category_ids.includes(c.id)
                return <button type="button" key={c.id} aria-pressed={on} onClick={() => setD({ ...d, category_ids: on ? d.category_ids.filter((x) => x !== c.id) : [...d.category_ids, c.id] })}
                  className={`h-10 px-3 rounded-full border font-semibold ${on ? 'bg-forest text-white border-forest' : 'bg-white border-stone-300'}`}>{c.name}</button>
              })}
            </div>
          </div>
        </Section>

        <Section title="Highlights (3–5 short facts) *">
          {(d.place.highlights as string[]).map((h, i) => (
            <input key={i} aria-label={`Highlight ${i + 1}`} className={inp} maxLength={90} placeholder={i < 3 ? 'Required' : 'Optional'} value={h}
              onChange={(e) => { const hs = [...d.place.highlights]; hs[i] = e.target.value; setP('highlights', hs) }} />
          ))}
          {d.place.highlights.length < 5 && <button type="button" className="self-start text-sm font-semibold" onClick={() => setP('highlights', [...d.place.highlights, ''])}>+ Add highlight</button>}
        </Section>

        <Section title="Cover photo *">
          {d.place.cover_photo && <img src={`/img/${d.place.cover_photo}-1200.webp`} alt="Cover" className="w-full max-w-md rounded-xl object-cover aspect-video" />}
          <Field label={d.place.cover_photo ? 'Replace photo' : 'Choose photo'} hint="Use your own photo or one you have permission to use. It is resized automatically.">
            <input type="file" accept="image/*" disabled={busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
          </Field>
        </Section>

        <Section title="Location and access">
          <Field label="Paste a Google Maps link or coordinates" hint="On Google Maps, long-press or right-click the spot, copy the numbers, and paste here.">
            <div className="flex gap-2">
              <input className={inp} value={mapsText} onChange={(e) => setMapsText(e.target.value)} />
              <button type="button" className={`${btn} border border-stone-300 bg-white`} onClick={() => { const c = parseMapsLink(mapsText); if (c) { setD({ ...d, place: { ...d.place, lat: c[0], lng: c[1] } }); setMapsText('') } else setMsg({ text: 'Could not read coordinates from that. Paste numbers like 10.2381, 77.4892.' }) }}>Use</button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude"><input className={inp} inputMode="decimal" value={d.place.lat ?? ''} onChange={(e) => setP('lat', e.target.value)} /></Field>
            <Field label="Longitude"><input className={inp} inputMode="decimal" value={d.place.lng ?? ''} onChange={(e) => setP('lng', e.target.value)} /></Field>
          </div>
          {d.place.lat && d.place.lng && <a href={`https://www.google.com/maps/search/?api=1&query=${d.place.lat},${d.place.lng}`} target="_blank" rel="noreferrer" className="text-sm">Check this spot on Google Maps ↗</a>}
          <Field label="How to reach" hint="Nearest airport, railway station, bus stand and distances"><textarea className={area} value={d.place.how_to_reach ?? ''} onChange={(e) => setP('how_to_reach', e.target.value)} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Access effort"><select className={inp} value={d.place.access_effort ?? ''} onChange={(e) => setP('access_effort', e.target.value)}><option value="">Choose…</option>{ACCESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Access notes" hint="e.g. ~600 steps; winch and rope car available"><input className={inp} value={d.place.access_notes ?? ''} onChange={(e) => setP('access_notes', e.target.value)} /></Field>
            <Field label="Entry fee"><input className={inp} value={d.place.entry_fee ?? ''} onChange={(e) => setP('entry_fee', e.target.value)} /></Field>
            <Field label="Stay options nearby" hint="e.g. Homestays, budget hotels, resorts"><input className={inp} value={d.place.stay_nearby ?? ''} onChange={(e) => setP('stay_nearby', e.target.value)} /></Field>
            {kind === 'vacation' && <Field label="Opening hours"><input className={inp} value={d.place.timings ?? ''} onChange={(e) => setP('timings', e.target.value)} /></Field>}
          </div>
          <div className="flex flex-col gap-1 text-sm font-semibold">Amenities
            <div className="flex flex-wrap gap-x-4 gap-y-2 font-normal">
              {AMENITIES.map(([k, l]) => <label key={k} className="flex items-center gap-2 min-h-11"><input type="checkbox" className="w-5 h-5" checked={(d.place.amenities as string[]).includes(k)}
                onChange={(e) => setP('amenities', e.target.checked ? [...d.place.amenities, k] : d.place.amenities.filter((x: string) => x !== k))} />{l}</label>)}
            </div>
          </div>
        </Section>

        {kind === 'vacation' ? (
          <Section title="Explore details">
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
          <Section title="Darshan details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Main deity"><input className={inp} value={d.details.main_deity ?? ''} onChange={(e) => setDet('main_deity', e.target.value)} /></Field>
              <Field label="Tradition" hint="e.g. Shaiva, Vaishnava, Shakta, Jain, Sikh"><input className={inp} value={d.details.tradition ?? ''} onChange={(e) => setDet('tradition', e.target.value)} /></Field>
            </div>
            <Field label="Significance"><input className={inp} value={d.details.significance ?? ''} onChange={(e) => setDet('significance', e.target.value)} /></Field>
            <div className="flex flex-col gap-2 text-sm font-semibold">Darshan hours
              {(d.details.darshan_hours as { open: string; close: string }[]).map((s, i) => (
                <div key={i} className="flex items-center gap-2 font-normal">
                  <input type="time" aria-label="Opens" className={inp} value={s.open} onChange={(e) => { const hs = [...d.details.darshan_hours]; hs[i] = { ...s, open: e.target.value }; setDet('darshan_hours', hs) }} />
                  <span>to</span>
                  <input type="time" aria-label="Closes" className={inp} value={s.close} onChange={(e) => { const hs = [...d.details.darshan_hours]; hs[i] = { ...s, close: e.target.value }; setDet('darshan_hours', hs) }} />
                  <button type="button" aria-label="Remove session" className={`${btn} border border-stone-300 bg-white`} onClick={() => setDet('darshan_hours', d.details.darshan_hours.filter((_: unknown, j: number) => j !== i))}>✕</button>
                </div>
              ))}
              <button type="button" className="self-start text-sm font-semibold" onClick={() => setDet('darshan_hours', [...d.details.darshan_hours, { open: '06:00', close: '12:00' }])}>+ Add session</button>
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
                  <button type="button" aria-label="Remove circuit" className={`${btn} border border-stone-300 bg-white`} onClick={() => setD({ ...d, circuits: d.circuits.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="self-start text-sm font-semibold" onClick={() => setD({ ...d, circuits: [...d.circuits, { circuit_id: lookups.circuits[0].id, position: '' }] })}>+ Add to a circuit</button>
            </div>
          </Section>
        )}

        <Section title="Contacts">
          <p className="m-0 text-sm text-muted">Official numbers only (temple office, tourism office, forest department).</p>
          {d.contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[8rem_1fr] sm:grid-cols-[9rem_12rem_1fr_auto] gap-2 items-center">
              <select aria-label="Type" className={inp} value={c.type} onChange={(e) => { const cs = [...d.contacts]; cs[i] = { ...c, type: e.target.value }; setD({ ...d, contacts: cs }) }}>{CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <input aria-label="Label" placeholder="Label, e.g. Temple office" className={inp} value={c.label ?? ''} onChange={(e) => { const cs = [...d.contacts]; cs[i] = { ...c, label: e.target.value }; setD({ ...d, contacts: cs }) }} />
              <input aria-label="Number or link" placeholder={c.type === 'phone' || c.type === 'whatsapp' ? '+91 …' : 'https://…'} className={inp} value={c.value} onChange={(e) => { const cs = [...d.contacts]; cs[i] = { ...c, value: e.target.value }; setD({ ...d, contacts: cs }) }} />
              <button type="button" aria-label="Remove contact" className={`${btn} border border-stone-300 bg-white`} onClick={() => setD({ ...d, contacts: d.contacts.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="self-start text-sm font-semibold" onClick={() => setD({ ...d, contacts: [...d.contacts, { type: 'phone', label: '', value: '' }] })}>+ Add contact</button>
        </Section>

        <Section title="Source and search words">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Original reel link"><input className={inp} type="url" value={d.place.source_reel_url ?? ''} onChange={(e) => setP('source_reel_url', e.target.value)} /></Field>
            <Field label="Creator handle" hint="Credited as “Seen on @handle”"><input className={inp} value={d.place.creator_handle ?? ''} onChange={(e) => setP('creator_handle', e.target.value)} /></Field>
          </div>
          <Field label="Tags" hint="Extra search words, comma separated: sunrise, trekking, boating"><input className={inp} value={d.place.tags ?? ''} onChange={(e) => setP('tags', e.target.value)} /></Field>
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
