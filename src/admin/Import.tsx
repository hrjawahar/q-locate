import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Me } from './api'

interface Preset { id: string; label: string; kind: 'vacation' | 'spiritual'; mode: 'type' | 'names'; scope?: 'india' | 'intl'; category: string; circuit?: string; count?: number }
interface Item { id: string; label: string; description: string; exists?: number | null; queued?: boolean; position?: number; query?: string; alternatives?: { id: string; label: string; description: string }[] }
interface Status { counts: Record<string, number>; batch?: Record<string, number>; recent: { id: number; wikidata_id: string; label: string; status: string; error: string | null; place_id: number | null }[]; ai: boolean }

const inp = 'h-11 w-full rounded-lg border border-stone-300 bg-white px-3'
const btn = 'h-11 px-4 rounded-lg font-semibold disabled:opacity-50'

export default function Import({ me }: { me: Me }) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetId, setPresetId] = useState('')
  const [region, setRegion] = useState('')
  const [country, setCountry] = useState('')
  const [customType, setCustomType] = useState('')
  const [customKind, setCustomKind] = useState<'vacation' | 'spiritual'>(me.scope === 'spiritual' ? 'spiritual' : 'vacation')
  const [customScope, setCustomScope] = useState<'india' | 'intl'>('india')
  const [names, setNames] = useState('')
  const [notable, setNotable] = useState(true)
  const [items, setItems] = useState<Item[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [info, setInfo] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [st, setSt] = useState<Status | null>(null)
  const [running, setRunning] = useState(false)
  const runRef = useRef(false)

  useEffect(() => {
    api<{ presets: Preset[] }>('/import/presets').then((d) => setPresets(d.presets.filter((p) => me.scope === 'all' || p.kind === me.scope)))
    api<Status>('/import/status').then(setSt)
    const t = setInterval(() => { if (!runRef.current) api<Status>('/import/status').then(setSt).catch(() => {}) }, 15000)
    return () => { clearInterval(t); runRef.current = false }
  }, [me.scope])

  const preset = presets.find((p) => p.id === presetId)
  const mode: 'preset' | 'type' | 'names' = presetId === '__type' ? 'type' : presetId === '__names' ? 'names' : 'preset'
  const kind = preset ? preset.kind : customKind
  const intl = preset ? preset.scope === 'intl' : customScope === 'intl'

  const runPreview = async () => {
    setBusy(true); setErr(''); setItems(null); setInfo('Asking Wikidata… large lists can take up to 30 seconds.')
    try {
      const body: Record<string, unknown> = { notable_only: notable, region: intl ? '' : region, country: intl ? country : '' }
      if (mode === 'preset') body.preset = presetId
      if (mode === 'type') { body.type_label = customType; body.scope = customScope }
      if (mode === 'names') body.names = names.split('\n')
      const d = await api<{ items: Item[]; type?: { id: string; label: string; description: string }; country?: { label: string } | null }>('/import/preview', { method: 'POST', json: body })
      setItems(d.items)
      setPicked(new Set(d.items.filter((i) => i.id && !i.exists && !i.queued).map((i) => i.id)))
      const fresh = d.items.filter((i) => i.id && !i.exists && !i.queued).length
      setInfo(`${d.items.length} found${d.type ? ` for type “${d.type.label}” (${d.type.id}${d.type.description ? ' — ' + d.type.description : ''})` : ''}${d.country === null ? ' outside India' : d.country ? ` in ${d.country.label}` : ''}. ${fresh} new; ${d.items.length - fresh} already added, queued or not found.`)
    } catch (e) { setErr((e as Error).message); setInfo('') } finally { setBusy(false) }
  }

  const swap = (i: number, altId: string) => {
    if (!items) return
    const it = items[i], alt = it.alternatives!.find((a) => a.id === altId)!
    const next = [...items]; next[i] = { ...it, id: alt.id, label: alt.label, description: alt.description, alternatives: [{ id: it.id, label: it.label, description: it.description }, ...it.alternatives!.filter((a) => a.id !== altId)] }
    setItems(next); const p = new Set(picked); p.delete(it.id); p.add(alt.id); setPicked(p)
  }

  const queue = async () => {
    if (!items) return
    setBusy(true); setErr('')
    try {
      const chosen = items.filter((i) => i.id && picked.has(i.id))
      const s = await api<Status>('/import/queue', { method: 'POST', json: {
        kind, category: preset?.category ?? null, circuit: preset?.circuit ?? null,
        items: chosen.map((i) => ({ id: i.id, label: i.label, position: i.position })),
      } })
      setSt(s); setItems(null); setInfo(`${chosen.length} queued. They import in the background, about 2 a minute, even if you close this page. Keep this page open and press “Import faster” to speed it up.`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const runLoop = async () => {
    runRef.current = true; setRunning(true)
    try {
      while (runRef.current) {
        const s = await api<Status>('/import/run', { method: 'POST' })
        setSt(s)
        if (!s.counts.pending) break
      }
    } catch (e) { setErr((e as Error).message) } finally { runRef.current = false; setRunning(false) }
  }

  const c = st?.counts ?? {}
  const bt = st?.batch ?? {}
  const total = (bt.pending ?? 0) + (bt.processing ?? 0) + (bt.done ?? 0) + (bt.skipped ?? 0) + (bt.error ?? 0)
  const finished = (bt.done ?? 0) + (bt.skipped ?? 0) + (bt.error ?? 0)
  const everything = (c.pending ?? 0) + (c.processing ?? 0) + (c.done ?? 0) + (c.skipped ?? 0) + (c.error ?? 0)

  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 font-display text-2xl font-bold">Import from open sources</h1>
      <p className="m-0 text-sm text-muted">Places come from Wikidata, with photos from Wikimedia Commons and nearby stations, stays, eateries and sights from OpenStreetMap. {st?.ai ? 'AI drafts the summary, highlights, how to reach and nearby notes from those sources only.' : 'AI drafting is off (no ANTHROPIC_API_KEY set).'} Everything arrives as a <b>draft marked “needs review”</b>; nothing is published until you check it.</p>

      {st && everything > 0 && (
        <div className="p-4 rounded-xl border border-stone-200 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <b>{total && (c.pending || c.processing) ? `Current batch: ${finished} of ${total} finished` : 'Import queue: all finished'}</b>
            <span>Waiting {c.pending ?? 0}</span><span>Working {c.processing ?? 0}</span><span className="text-green-800">Done {c.done ?? 0}</span>
            <span>Skipped {c.skipped ?? 0}</span><span className="text-red-700">Errors {c.error ?? 0}</span>
            <Link to="/admin?status=imported" className="ml-auto font-semibold">Review imported drafts →</Link>
          </div>
          <div className="h-2 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-forest" style={{ width: `${c.pending || c.processing ? (total ? (finished / total) * 100 : 0) : 100}%` }} /></div>
          <div className="flex flex-wrap gap-2">
            {(c.pending ?? 0) > 0 && (running
              ? <button className={`${btn} border border-stone-300 bg-white`} onClick={() => { runRef.current = false }}>Pause fast import</button>
              : <button className={`${btn} bg-forest text-white`} onClick={runLoop}>Import faster (keep page open)</button>)}
            {(c.error ?? 0) > 0 && <button className={`${btn} border border-stone-300 bg-white`} onClick={async () => setSt(await api<Status>('/import/retry', { method: 'POST' }))}>Retry errors</button>}
            {(c.pending ?? 0) > 0 && !running && <button className={`${btn} border border-stone-300 bg-white`} onClick={async () => setSt(await api<Status>('/import/clear', { method: 'POST' }))}>Cancel waiting items</button>}
          </div>
          {st.recent.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer">Recent results</summary>
              <ul className="m-0 mt-2 pl-4">{st.recent.map((r) => (
                <li key={r.id}>{r.place_id ? <Link to={`/admin/places/${r.place_id}`}>{r.label || r.wikidata_id}</Link> : r.label || r.wikidata_id} — {r.status}{r.error ? `: ${r.error}` : ''}</li>
              ))}</ul>
            </details>
          )}
        </div>
      )}

      <div className="p-4 rounded-xl border border-stone-200 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">What to import
          <select className={inp} value={presetId} onChange={(e) => { setPresetId(e.target.value); setItems(null); setInfo('') }}>
            <option value="">Choose…</option>
            <optgroup label="Explore — India">{presets.filter((p) => p.kind === 'vacation' && p.scope === 'india').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
            <optgroup label="Explore — International">{presets.filter((p) => p.kind === 'vacation' && p.scope === 'intl').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
            <optgroup label="Darshan — India">{presets.filter((p) => p.kind === 'spiritual' && p.mode === 'type' && p.scope === 'india').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
            <optgroup label="Darshan — International">{presets.filter((p) => p.kind === 'spiritual' && p.scope === 'intl').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>
            <optgroup label="Darshan — Circuits">{presets.filter((p) => p.mode === 'names').map((p) => <option key={p.id} value={p.id}>{p.label} ({p.count})</option>)}</optgroup>
            <optgroup label="Other"><option value="__type">Any kind of place (type it)</option><option value="__names">A list of names (paste)</option></optgroup>
          </select>
        </label>

        {(mode === 'type' || mode === 'names') && presetId && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">Tab<select className={inp} value={customKind} onChange={(e) => setCustomKind(e.target.value as 'vacation' | 'spiritual')} disabled={me.scope !== 'all'}><option value="vacation">Explore</option><option value="spiritual">Darshan</option></select></label>
            {mode === 'type' && <label className="flex flex-col gap-1 text-sm font-semibold">India or abroad<select className={inp} value={customScope} onChange={(e) => setCustomScope(e.target.value as 'india' | 'intl')}><option value="india">India</option><option value="intl">International</option></select></label>}
          </div>
        )}
        {mode === 'type' && <label className="flex flex-col gap-1 text-sm font-semibold">Kind of place<input className={inp} placeholder="e.g. Divya Desam, Shakti Peetha, cave, dam, tea estate" value={customType} onChange={(e) => setCustomType(e.target.value)} /></label>}
        {mode === 'names' && <label className="flex flex-col gap-1 text-sm font-semibold">Names, one per line (up to 40)<textarea className="w-full rounded-lg border border-stone-300 p-3 min-h-32" value={names} onChange={(e) => setNames(e.target.value)} /></label>}
        {mode !== 'names' && presetId && (intl
          ? <label className="flex flex-col gap-1 text-sm font-semibold">Country (leave empty for all countries outside India)<input className={inp} placeholder="e.g. Nepal, Sri Lanka, Thailand" value={country} onChange={(e) => setCountry(e.target.value)} /></label>
          : <label className="flex flex-col gap-1 text-sm font-semibold">State (optional)<input className={inp} list="states" placeholder="All of India" value={region} onChange={(e) => setRegion(e.target.value)} /></label>)}
        {mode !== 'names' && presetId && <label className="flex items-center gap-2 text-sm min-h-11"><input type="checkbox" className="w-5 h-5" checked={notable} onChange={(e) => setNotable(e.target.checked)} />Only well-documented places (with an English Wikipedia article) — recommended</label>}
        {presetId && <button className={`${btn} bg-forest text-white self-start`} disabled={busy} onClick={runPreview}>Find places</button>}
        {info && <p className="m-0 text-sm">{info}</p>}
        {err && <p className="m-0 text-sm text-red-700">{err}</p>}
      </div>

      {items && items.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button className="font-semibold" onClick={() => setPicked(new Set(items.filter((i) => i.id && !i.exists && !i.queued).map((i) => i.id)))}>Select all new</button>
            <button className="font-semibold" onClick={() => setPicked(new Set())}>Select none</button>
            <span className="ml-auto">{picked.size} selected</span>
            <button className={`${btn} bg-saffron text-maroon`} disabled={busy || picked.size === 0} onClick={queue}>Import {picked.size} as drafts</button>
          </div>
          <ul className="list-none m-0 p-0 divide-y divide-stone-200 border border-stone-200 rounded-xl text-sm">
            {items.map((it, i) => (
              <li key={`${it.id}-${i}`} className="flex flex-wrap items-center gap-3 p-3">
                <input type="checkbox" className="w-5 h-5" aria-label={`Import ${it.label}`} disabled={!it.id || !!it.exists || it.queued} checked={picked.has(it.id)}
                  onChange={(e) => { const p = new Set(picked); if (e.target.checked) p.add(it.id); else p.delete(it.id); setPicked(p) }} />
                <div className="flex-1 min-w-48">
                  <div className="font-semibold">{it.position ? `${it.position}. ` : ''}{it.label} {it.id && <a href={`https://www.wikidata.org/wiki/${it.id}`} target="_blank" rel="noreferrer" className="font-normal text-xs">{it.id} ↗</a>}</div>
                  <div className="text-muted">{it.description || '—'}{it.query && it.query !== it.label ? ` · searched “${it.query}”` : ''}</div>
                </div>
                {it.exists ? <Link to={`/admin/places/${it.exists}`} className="text-xs font-semibold">Already added</Link> : it.queued ? <span className="text-xs">Queued</span> : null}
                {it.alternatives && it.alternatives.length > 0 && !it.exists && (
                  <select aria-label="Pick a different match" className="h-10 rounded-lg border border-stone-300 px-2 max-w-64" value="" onChange={(e) => swap(i, e.target.value)}>
                    <option value="">Wrong match? Pick another…</option>
                    {it.alternatives.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.description.slice(0, 50)}</option>)}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <datalist id="states">{['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Meghalaya', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'].map((s) => <option key={s} value={s} />)}</datalist>
    </section>
  )
}
