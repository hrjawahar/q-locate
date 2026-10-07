import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Me } from './api'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const inp = 'h-11 w-full rounded-lg border border-stone-300 px-3 bg-white font-normal'
const btn = 'h-11 px-4 rounded-lg font-semibold border border-stone-300 bg-white disabled:opacity-50'
const hot = 'h-11 px-4 rounded-lg font-semibold bg-forest text-white disabled:opacity-50'
const ST: Record<string, [string, string]> = { draft: ['Draft', 'bg-stone-100'], published: ['Published', 'bg-green-100 text-green-900'], archived: ['Archived', 'bg-stone-200 text-stone-500'] }
const today = () => new Date().toISOString().slice(0, 10)

interface Draft {
  name: string; alt_names: string | null; country: string | null; state: string | null; towns: string | null; kind: string | null; months: number[]
  next_start: string | null; next_end: string | null; dates_checked_on: string | null; summary: string | null; tips: string | null
  refs: { url: string; title: string }[]; ai_pending?: string[]; status?: string
}
interface Row { id: number; name: string; country: string | null; state: string | null; kind: string | null; months: string | null; next_start: string | null; next_end: string | null; status: string; ai_pending: string | null }
interface Job { ids: number[]; total: number; done: number; found: number; same?: number; none: number; failed: number; started: string; by: string }
interface PlaceRef { id: number; name: string; kind: string; state: string | null; country: string | null }

async function addOne(name: string, country: string, note: string): Promise<{ id: number; existed: boolean }> {
  const r = await api<{ draft?: Draft; duplicate?: { id: number } }>('/festivals/fill', { method: 'POST', json: { name, country, note } })
  if (r.duplicate) return { id: r.duplicate.id, existed: true }
  const s = await api<{ id: number }>('/festivals', { method: 'POST', json: { festival: { ...r.draft, ai_pending: ['details'] } } })
  return { id: s.id, existed: false }
}

export function FestivalsList({ me }: { me: Me }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState(''), [status, setStatus] = useState('')
  const [form, setForm] = useState({ name: '', country: '', note: '' })
  const [bulk, setBulk] = useState(''), [showBulk, setShowBulk] = useState(false)
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState('')
  const nav = useNavigate()
  const [job, setJob] = useState<{ job: Job | null; datesToCheck: number } | null>(null)
  const loadJob = () => api<{ job: Job | null; datesToCheck: number }>('/festivals/refresh').then(setJob).catch(() => {})
  useEffect(() => { loadJob(); const t = setInterval(loadJob, 20000); return () => clearInterval(t) }, [])
  const running = !!job?.job?.ids.length
  const refreshAll = async () => {
    if (!confirm('Look up the latest dates for every published festival?\n\nThis runs in the background (about 2 festivals a minute) — you can close the browser. New dates stay hidden from users until you check them.')) return
    try { const r = await api<{ job: Job }>('/festivals/refresh', { method: 'POST' }); setJob({ job: r.job, datesToCheck: job?.datesToCheck ?? 0 }) } catch (e) { setMsg((e as Error).message) }
  }
  const load = () => api<{ festivals: Row[] }>(`/festivals?${new URLSearchParams({ q, status })}`).then((d) => setRows(d.festivals)).catch(() => setRows([]))
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const quickAdd = async () => {
    if (!form.name.trim()) return
    setBusy('Researching and drafting with AI… (up to a minute)'); setMsg('')
    try {
      const r = await addOne(form.name.trim(), form.country.trim(), form.note.trim())
      if (r.existed) setMsg('Already in Festivals — opening it.')
      nav(`/admin/festivals/${r.id}`)
    } catch (e) { setMsg((e as Error).message) }
    setBusy('')
  }
  const addMany = async () => {
    const lines = bulk.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((l) => l[0])
    let added = 0, existed = 0
    for (let i = 0; i < lines.length; i++) {
      setBusy(`Adding ${i + 1} of ${lines.length}: ${lines[i][0]}… keep this page open.`)
      try { const r = await addOne(lines[i][0], lines[i][1] ?? '', ''); if (r.existed) existed++; else added++ } catch { /* keep going */ }
    }
    setBusy(''); setBulk(''); setShowBulk(false); setMsg(`Added ${added} new drafts${existed ? `; ${existed} were already listed` : ''}.`); load()
  }

  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 font-display text-2xl font-bold">Festivals</h1>
      <p className="m-0 text-sm text-muted">Annual festivals in India and abroad. Type a name; AI researches what happens, where, the usual month and this year’s dates as a draft for you to check. Link each festival to its temple or place so it shows on that page too.</p>

      <div className="p-4 rounded-xl border border-stone-200 flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Add a festival</h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input className={`${inp} sm:col-span-3`} placeholder="Festival name * (e.g. Thrissur Pooram)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={`${inp} sm:col-span-3`} placeholder="Country (optional, helps the AI)" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <input className={`${inp} sm:col-span-6`} placeholder="Anything specific? (optional, e.g. the Kolkata pandals)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className={hot} disabled={!!busy || !form.name.trim()} onClick={quickAdd}>Add with AI</button>
          <button className={btn} disabled={!!busy} onClick={() => setShowBulk(!showBulk)}>Add several</button>
          {busy && <span className="text-sm" role="status">{busy}</span>}
        </div>
        {showBulk && (
          <div className="flex flex-col gap-2">
            <label className="text-sm">One per line: <code>Festival name | Country</code> — country is optional.
              <textarea className="w-full min-h-32 mt-1 rounded-lg border border-stone-300 p-3 font-mono text-sm" value={bulk} onChange={(e) => setBulk(e.target.value)}
                placeholder={'Durga Puja | India\nHornbill Festival\nSongkran | Thailand'} /></label>
            <button className={`${hot} self-start`} disabled={!!busy || !bulk.trim()} onClick={addMany}>Add all</button>
          </div>
        )}
        {msg && <p className="m-0 text-sm" role="status">{msg}</p>}
      </div>

      <div className="p-4 rounded-xl border border-stone-200 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-lg font-semibold flex-1">Festival dates</h2>
          {me.role !== 'editor' && <button className={hot} disabled={running} onClick={refreshAll}>{running ? 'Refreshing…' : 'Refresh all dates'}</button>}
        </div>
        {job?.job && (
          <div className="flex flex-col gap-1 text-sm">
            <div>{running ? `Working: ${job.job.done} of ${job.job.total} checked` : `Last run (${new Date(job.job.started).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${job.job.by === 'monthly check' ? ', automatic' : ''}): ${job.job.done} of ${job.job.total} checked`}
              {' '}· <b>{job.job.found}</b> new dates · {job.job.same ?? 0} unchanged · {job.job.none} not announced yet{job.job.failed ? ` · ${job.job.failed} failed` : ''}</div>
            {running && <div className="h-2 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-plum" style={{ width: `${job.job.total ? (job.job.done / job.job.total) * 100 : 0}%` }} /></div>}
          </div>
        )}
        {(job?.datesToCheck ?? 0) > 0 && <button className="self-start text-sm font-semibold underline" onClick={() => setStatus('datescheck')}>{job!.datesToCheck} {job!.datesToCheck === 1 ? 'festival has' : 'festivals have'} new dates to check →</button>}
        <p className="m-0 text-xs text-muted">Runs automatically on the 1st of every month too. New dates appear to users only after you open the festival and tick “I’ve checked it”.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input className={`${inp} flex-1 min-w-48`} placeholder="Search name, state, country, town" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inp} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="draft">Drafts</option><option value="published">Published</option><option value="datescheck">New dates to check</option><option value="stale">Published — dates need updating</option><option value="archived">Archived</option></select>
      </div>
      {!rows ? <p>Loading…</p> : rows.length === 0 ? <p className="text-muted">No festivals yet.</p> : (
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-stone-200 border border-stone-200 rounded-xl">
          {rows.map((r) => {
            const pending = (JSON.parse(r.ai_pending || '[]') as string[]).length > 0
            const stale = r.status === 'published' && (!r.next_end || r.next_end < today())
            return (
              <li key={r.id}><Link to={`/admin/festivals/${r.id}`} className="flex flex-wrap items-center gap-3 p-3 no-underline text-ink">
                <div className="flex-1 min-w-48"><div className="font-semibold">{r.name}</div>
                  <div className="text-sm text-muted">{[r.state, r.country, r.kind, (r.months ?? '').split(',').filter(Boolean).map((m) => MONTHS[Number(m) - 1]).join('/'), r.next_start && `${r.next_start}${r.next_end && r.next_end !== r.next_start ? ` → ${r.next_end}` : ''}`].filter(Boolean).join(' · ')}</div></div>
                {stale && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900">Update dates</span>}
                {pending && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900">AI draft — check</span>}
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ST[r.status]?.[1]}`}>{ST[r.status]?.[0] ?? r.status}</span>
              </Link></li>
            )
          })}
        </ul>
      )}
      {me.role === 'editor' && <p className="m-0 text-sm text-muted">Editors can add and edit drafts; a publisher or owner publishes.</p>}
    </section>
  )
}

export function FestivalForm({ me }: { me: Me }) {
  const { id } = useParams()
  const nav = useNavigate()
  const [f, setF] = useState<Draft | null>(null)
  const [places, setPlaces] = useState<PlaceRef[]>([])
  const [pq, setPq] = useState(''), [found, setFound] = useState<PlaceRef[]>([])
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api<{ festival: Draft; places: PlaceRef[] }>(`/festivals/${id}`).then((d) => { setF(d.festival); setPlaces(d.places) }).catch((e) => setMsg({ text: e.message })) }, [id])
  useEffect(() => {
    if (pq.trim().length < 2) { setFound([]); return }
    const t = setTimeout(() => api<{ places: PlaceRef[] }>(`/places?${new URLSearchParams({ q: pq })}`).then((d) => setFound(d.places.slice(0, 8))).catch(() => setFound([])), 300)
    return () => clearTimeout(t)
  }, [pq])
  if (!f) return <p>{msg?.text ?? 'Loading…'}</p>
  const set = (k: keyof Draft, v: unknown) => setF({ ...f, [k]: v })
  const pending = (f.ai_pending ?? []).length > 0
  const canPub = me.role !== 'editor'
  const payload = () => ({ festival: f, place_ids: places.map((p) => p.id) })

  const save = async () => {
    setBusy(true); setMsg(null)
    try { await api(`/festivals/${id}`, { method: 'PUT', json: payload() }); setMsg({ text: 'Saved', ok: true }) } catch (e) { setMsg({ text: (e as Error).message }) }
    setBusy(false)
  }
  const status = async (s: string) => {
    setBusy(true); setMsg(null)
    try {
      await api(`/festivals/${id}`, { method: 'PUT', json: payload() })
      await api(`/festivals/${id}/status`, { method: 'POST', json: { status: s } })
      setF({ ...f, status: s }); setMsg({ text: s === 'published' ? 'Published — it’s live in Festivals' : 'Updated', ok: true })
    } catch (e) { setMsg({ text: (e as Error).message }) }
    setBusy(false)
  }
  const refresh = async () => {
    setBusy(true); setMsg({ text: 'Looking up the next dates… (up to a minute)', ok: true })
    try {
      await api(`/festivals/${id}`, { method: 'PUT', json: payload() })
      const r = await api<{ ok: boolean; same?: boolean; note?: string; next_start?: string; next_end?: string; refs?: Draft['refs'] }>(`/festivals/${id}/dates`, { method: 'POST' })
      if (r.same) { setF({ ...f, dates_checked_on: today() }); setMsg({ text: 'Same dates as before — nothing new to check.', ok: true }) }
      else if (r.ok) { setF({ ...f, next_start: r.next_start!, next_end: r.next_end!, dates_checked_on: today(), refs: r.refs ?? f.refs, ai_pending: [...new Set([...(f.ai_pending ?? []), 'dates'])] }); setMsg({ text: 'New dates found — check them against the pages below, then confirm.', ok: true }) }
      else setMsg({ text: r.note ?? 'No dates found' })
    } catch (e) { setMsg({ text: (e as Error).message }) }
    setBusy(false)
  }
  const del = async () => { if (!confirm('Delete this festival?')) return; await api(`/festivals/${id}`, { method: 'DELETE' }); nav('/admin/festivals') }
  const field = (label: string, el: React.ReactNode, cls = '') => <label className={`flex flex-col gap-1 text-sm font-semibold ${cls}`}>{label}{el}</label>

  return (
    <section className="flex flex-col gap-5 max-w-3xl">
      <Link to="/admin/festivals" className="text-sm">← Festivals</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-display text-2xl font-bold flex-1">{f.name || 'Festival'}</h1>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ST[f.status ?? 'draft'][1]}`}>{ST[f.status ?? 'draft'][0]}</span>
      </div>
      {pending && (
        <div className="p-3 rounded-lg bg-amber-50 text-amber-900 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1">AI draft — check {(f.ai_pending ?? []).includes('dates') && !(f.ai_pending ?? []).includes('details') ? 'the new dates' : 'the details and dates'} against the pages listed at the bottom, then confirm.{f.status === 'published' && (f.ai_pending ?? []).includes('dates') ? ' Until then users see the usual month only.' : ''}</span>
          <button className="h-9 px-3 rounded-lg bg-white border border-amber-300 font-semibold" onClick={() => set('ai_pending', [])}>I’ve checked it</button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        {field('Name *', <input className={inp} value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} />, 'sm:col-span-3')}
        {field('Other names', <input className={inp} placeholder="e.g. Durgotsav, Sharodotsav" value={f.alt_names ?? ''} onChange={(e) => set('alt_names', e.target.value)} />, 'sm:col-span-3')}
        {field('Country *', <input className={inp} value={f.country ?? ''} onChange={(e) => set('country', e.target.value)} />, 'sm:col-span-2')}
        {field('State / region', <input className={inp} value={f.state ?? ''} onChange={(e) => set('state', e.target.value)} />, 'sm:col-span-2')}
        {field('Type *', <select className={inp} value={f.kind ?? ''} onChange={(e) => set('kind', e.target.value || null)}><option value="">Choose…</option><option value="religious">Religious (shows in Darshan)</option><option value="cultural">Cultural (shows in Explore)</option><option value="both">Both</option></select>, 'sm:col-span-2')}
        {field('Main towns / venues', <input className={inp} value={f.towns ?? ''} onChange={(e) => set('towns', e.target.value)} />, 'sm:col-span-6')}
      </div>
      <fieldset className="m-0 p-0 border-0">
        <legend className="text-sm font-semibold mb-2">Usual month(s) *</legend>
        <div className="flex flex-wrap gap-2">
          {MONTHS.map((m, i) => { const on = f.months.includes(i + 1); return (
            <button key={m} type="button" aria-pressed={on} onClick={() => set('months', on ? f.months.filter((x) => x !== i + 1) : [...f.months, i + 1].sort((a, b) => a - b))}
              className={`h-10 w-14 rounded-full border text-sm font-semibold ${on ? 'bg-plum text-white border-plum' : 'bg-white border-stone-300'}`}>{m}</button>) })}
        </div>
      </fieldset>
      <div className="p-4 rounded-xl bg-stone-50 flex flex-col gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
          {field('Next start', <input type="date" className={inp} value={f.next_start ?? ''} onChange={(e) => set('next_start', e.target.value || null)} />, 'sm:col-span-2')}
          {field('Next end', <input type="date" className={inp} value={f.next_end ?? ''} onChange={(e) => set('next_end', e.target.value || null)} />, 'sm:col-span-2')}
          <button className={`${btn} sm:col-span-2`} disabled={busy} onClick={refresh}>Refresh dates with AI</button>
        </div>
        <p className="m-0 text-xs text-muted">Lunar-calendar festivals move every year. Users see these dates only when they are in the future; otherwise they see the usual month. {f.dates_checked_on ? `Dates last checked ${f.dates_checked_on}.` : ''}</p>
      </div>
      {field('What happens * (2–3 sentences)', <textarea className="w-full min-h-24 rounded-lg border border-stone-300 p-3 font-normal" maxLength={600} value={f.summary ?? ''} onChange={(e) => set('summary', e.target.value)} />)}
      {field('Good to know (one practical line)', <input className={inp} maxLength={300} placeholder="e.g. Best viewed from Thekkinkadu Maidan; very crowded — arrive early" value={f.tips ?? ''} onChange={(e) => set('tips', e.target.value)} />)}

      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">Linked places</h2>
        <p className="m-0 text-sm text-muted">The festival appears on these temple / place pages under “Festivals here”.</p>
        <div className="flex flex-wrap gap-2">{places.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-2 h-9 pl-3 pr-1 rounded-full bg-stone-100 text-sm">{p.name}
            <button className="w-7 h-7 rounded-full hover:bg-stone-200" aria-label={`Remove ${p.name}`} onClick={() => setPlaces(places.filter((x) => x.id !== p.id))}>✕</button></span>))}</div>
        <input className={inp} placeholder="Search a place to link…" value={pq} onChange={(e) => setPq(e.target.value)} />
        {found.length > 0 && (
          <ul className="list-none m-0 p-0 border border-stone-200 rounded-lg divide-y divide-stone-200">
            {found.filter((p) => !places.some((x) => x.id === p.id)).map((p) => (
              <li key={p.id}><button className="w-full text-left px-3 py-2 hover:bg-stone-50 text-sm" onClick={() => { setPlaces([...places, p]); setPq('') }}><b>{p.name}</b> <span className="text-muted">· {[p.state, p.country].filter(Boolean).join(', ')}</span></button></li>
            ))}
          </ul>
        )}
      </div>

      {f.refs.length > 0 && (
        <div className="text-sm"><b>Pages the AI used</b> (for checking; not shown to users):
          <ul className="m-0 mt-1 pl-5">{f.refs.map((r, i) => <li key={i}><a href={r.url} target="_blank" rel="noreferrer" className="break-all">{r.title || r.url} ↗</a></li>)}</ul></div>
      )}

      <div className="flex flex-wrap gap-2 items-center py-3 border-t border-stone-200">
        <button className={btn} disabled={busy} onClick={save}>Save</button>
        {canPub && f.status !== 'published' && <button className="h-11 px-4 rounded-lg font-semibold bg-saffron text-maroon disabled:opacity-50" disabled={busy || pending} onClick={() => status('published')}>Publish</button>}
        {canPub && f.status === 'published' && <button className={btn} disabled={busy} onClick={() => status('draft')}>Unpublish</button>}
        {canPub && <button className={`${btn} ml-auto text-red-700`} disabled={busy} onClick={del}>Delete</button>}
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{msg.text}</span>}
      </div>
    </section>
  )
}
