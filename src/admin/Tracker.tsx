import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api'

interface TItem { id: string; name: string; desc: string; state: string; stateId: string; district: string; year: number | null; asi: boolean; heritage: string; wiki: string; faith: 'Hindu' | 'Jain' }
interface Data {
  updated: Record<string, string>; states: { id: string; name: string }[]; items: TItem[]; skipped: string[]
  status: Record<string, { id: number; status: string; verified_on: string | null }>; queued: string[]
}
type Prog = 'published' | 'working' | 'queued' | 'todo' | 'skipped'

const NOW = new Date().getFullYear()
const base = 'h-10 px-3 rounded-lg font-semibold border disabled:opacity-50'
const btn = `${base} border-stone-300 bg-white`
const hot = `${base} bg-saffron text-maroon border-saffron`
const sel = 'h-10 rounded-lg border border-stone-300 px-2 bg-white'
const PROG: Record<Prog, [string, string]> = {
  published: ['Published', 'bg-green-100 text-green-900'], working: ['In Q-Locate (not published)', 'bg-amber-100 text-amber-900'],
  queued: ['Importing…', 'bg-blue-100 text-blue-900'], todo: ['Not started', 'bg-stone-100 text-stone-700'], skipped: ['Skipped', 'bg-stone-200 text-stone-500'],
}
const built = (y: number | null) => (y == null ? '—' : `${y < 0 ? `${-y} BCE` : `c. ${y}`} (~${NOW - y} yrs)`)
const heritageLabel = (t: TItem) => t.asi ? 'ASI protected' : t.heritage ? t.heritage.split(';')[0] : ''

export default function Tracker() {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [job, setJob] = useState('')
  const [failed, setFailed] = useState<string[]>([])
  const [f, setF] = useState({ min: 100, max: 1500, undated: 'protected', wikiOnly: false, faith: '', state: '', prog: 'todo', q: '' })
  const [daily, setDaily] = useState(5)
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')

  const reload = () => api<Data>('/tracker').then(setD).catch((e) => setErr(String(e.message ?? e)))
  useEffect(() => { reload() }, [])

  const prog = (t: TItem): Prog => {
    const s = d?.status[t.id]
    if (s) return s.status === 'published' ? 'published' : 'working'
    if (d?.queued.includes(t.id)) return 'queued'
    return d?.skipped.includes(t.id) ? 'skipped' : 'todo'
  }

  // Temples in the chosen age range (or undated but heritage-protected, if chosen).
  const inRange = useMemo(() => (d?.items ?? []).filter((t) => {
    if (f.faith && t.faith !== f.faith) return false
    if (f.wikiOnly && !t.wiki) return false
    if (t.year == null) return f.undated === 'all' || (f.undated === 'protected' && (t.asi || !!t.heritage))
    const age = NOW - t.year
    return age >= f.min && age <= f.max
  }), [d, f.faith, f.wikiOnly, f.undated, f.min, f.max])

  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return inRange.filter((t) => (!f.state || t.stateId === f.state) && (!f.prog || prog(t) === f.prog || (f.prog === 'active' && prog(t) !== 'skipped'))
      && (!q || `${t.name} ${t.district} ${t.desc}`.toLowerCase().includes(q)))
      .sort((a, b) => a.state.localeCompare(b.state) || Number(b.asi) - Number(a.asi) || (a.year ?? 9999) - (b.year ?? 9999))
  }, [inRange, f.state, f.prog, f.q, d]) // eslint-disable-line react-hooks/exhaustive-deps

  const perState = useMemo(() => (d?.states ?? []).map((s) => {
    const xs = inRange.filter((t) => t.stateId === s.id)
    const c = { published: 0, working: 0, queued: 0, todo: 0, skipped: 0 }
    xs.forEach((t) => c[prog(t)]++)
    return { ...s, total: xs.length - c.skipped, ...c }
  }), [inRange, d]) // eslint-disable-line react-hooks/exhaustive-deps
  const tot = perState.reduce((a, s) => ({ total: a.total + s.total, published: a.published + s.published, working: a.working + s.working + s.queued }), { total: 0, published: 0, working: 0 })

  // Today's picks: one per state, starting with the states that have the fewest published; protected and well-documented temples first.
  const picks = useMemo(() => {
    const order = [...perState].filter((s) => s.todo > 0).sort((a, b) => a.published - b.published || b.todo - a.todo)
    const out: TItem[] = []
    for (let round = 0; out.length < daily && round < 5; round++) for (const s of order) {
      if (out.length >= daily) break
      const cand = inRange.filter((t) => t.stateId === s.id && prog(t) === 'todo' && !out.includes(t))
        .sort((a, b) => Number(b.asi) - Number(a.asi) || Number(!!b.wiki) - Number(!!a.wiki) || (a.year ?? 9999) - (b.year ?? 9999))
      if (cand[0]) out.push(cand[0])
    }
    return out
  }, [perState, inRange, daily]) // eslint-disable-line react-hooks/exhaustive-deps

  const build = async (only?: string[]) => {
    setErr(''); setFailed([])
    try {
      let states = d?.states ?? []
      if (!only) { setJob('Getting the list of states and union territories…'); states = (await api<{ states: Data['states'] }>('/tracker/refresh', { method: 'POST', json: {} })).states }
      const todo = only ? states.filter((s) => only.includes(s.id)) : states
      const bad: string[] = []
      for (let i = 0; i < todo.length; i++) {
        setJob(`Fetching temples in ${todo[i].name} (${i + 1} of ${todo.length})… keep this page open.`)
        try { await api('/tracker/refresh', { method: 'POST', json: { state: todo[i].id } }) }
        catch { try { await api('/tracker/refresh', { method: 'POST', json: { state: todo[i].id } }) } catch { bad.push(todo[i].id) } }
      }
      setFailed(bad)
    } catch (e) { setErr((e as Error).message) }
    setJob(''); reload()
  }

  const importIds = async (items: TItem[]) => {
    if (!items.length) return
    await api('/import/queue', { method: 'POST', json: { kind: 'spiritual', category: 'temple', items: items.map((t) => ({ id: t.id, label: t.name })) } })
    setMsg(`Queued ${items.length} for import. They arrive as drafts in about ${Math.ceil(items.length / 2) + 1} minutes — then review and publish them from Places.`)
    setPicked(new Set()); reload()
  }
  const skipIds = async (ids: string[], skip = true) => { await api('/tracker/skip', { method: 'POST', json: { ids, skip } }); setPicked(new Set()); reload() }

  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['State', 'Temple', 'District / town', 'Faith', 'Built', 'Age (years)', 'Heritage status', 'Q-Locate status', 'Wikidata', 'Wikipedia', 'Planned date', 'My notes']
    const rows = shown.map((t) => [t.state, t.name, t.district, t.faith, t.year == null ? '' : t.year < 0 ? `${-t.year} BCE` : t.year, t.year == null ? '' : NOW - t.year,
      heritageLabel(t), PROG[prog(t)][0], `https://www.wikidata.org/wiki/${t.id}`, t.wiki, '', ''])
    const blob = new Blob(['﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `q-locate-heritage-temples-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  if (!d) return <p>{err || 'Loading…'}</p>
  const pageItems = shown.slice(page * 50, page * 50 + 50)
  const setFilter = (k: string, v: unknown) => { setF({ ...f, [k]: v }); setPage(0) }

  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 font-display text-2xl font-bold">Heritage temple tracker</h1>
      <p className="m-0 text-sm text-muted">Historic Hindu and Jain temples in every state and union territory, from Wikidata (open, CC0), with ASI “protected monument” status and dates where recorded. Your progress updates by itself as you import and publish.</p>
      {err && <p className="m-0 p-3 rounded-lg bg-red-50 text-red-800 text-sm">{err}</p>}

      {d.items.length === 0 ? (
        <div className="p-5 rounded-xl border border-stone-200 flex flex-col gap-3">
          <p className="m-0">The list hasn't been built yet. This fetches each state in turn and takes about 5–10 minutes. Keep this page open while it runs.</p>
          <button className={`${base} self-start bg-forest text-white border-forest`} disabled={!!job} onClick={() => build()}>Build the list</button>
          {job && <p className="m-0 text-sm" role="status">{job}</p>}
        </div>
      ) : (<>
        <div className="p-4 rounded-xl border border-stone-200 flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <b className="text-base">{tot.published} of {tot.total} published</b><span>In progress {tot.working}</span><span>Not started {tot.total - tot.published - tot.working}</span>
            {tot.published < tot.total && <span className="text-muted">At {daily} a day: about {Math.ceil((tot.total - tot.published) / daily)} {Math.ceil((tot.total - tot.published) / daily) === 1 ? 'day' : 'days'} to go</span>}
          </div>
          <div className="h-2 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-forest" style={{ width: `${tot.total ? (tot.published / tot.total) * 100 : 0}%` }} /></div>
        </div>

        <div className="p-4 rounded-xl bg-[#FBF3E6] border border-[#EBD3AE] flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 font-display text-lg font-semibold">Today's picks</h2>
            <label className="text-sm flex items-center gap-2">How many a day <select className={sel} value={daily} onChange={(e) => setDaily(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
            <button className={`${hot} ml-auto`} disabled={!picks.length} onClick={() => importIds(picks)}>Import these {picks.length}</button>
          </div>
          <p className="m-0 text-xs text-muted">One per state, starting with states you have published least; ASI-protected and well-documented temples first.</p>
          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-sm">
            {picks.map((t) => <li key={t.id}><b>{t.name}</b> <span className="text-muted">· {t.district ? `${t.district}, ` : ''}{t.state} · {built(t.year)}{heritageLabel(t) ? ` · ${heritageLabel(t)}` : ''}</span></li>)}
            {!picks.length && <li className="text-muted">Nothing left in the current range. Widen the filters below.</li>}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 items-end text-sm">
          <label className="flex flex-col gap-1">Age from (years)<input className={`${sel} w-24`} inputMode="numeric" value={f.min} onChange={(e) => setFilter('min', Number(e.target.value) || 0)} /></label>
          <label className="flex flex-col gap-1">to<input className={`${sel} w-24`} inputMode="numeric" value={f.max} onChange={(e) => setFilter('max', Number(e.target.value) || 99999)} /></label>
          <label className="flex flex-col gap-1">No recorded date<select className={sel} value={f.undated} onChange={(e) => setFilter('undated', e.target.value)}>
            <option value="protected">Include if heritage-protected</option><option value="all">Include all</option><option value="none">Leave out</option></select></label>
          <label className="flex flex-col gap-1">Faith<select className={sel} value={f.faith} onChange={(e) => setFilter('faith', e.target.value)}><option value="">Hindu and Jain</option><option>Hindu</option><option>Jain</option></select></label>
          <label className="flex items-center gap-2 h-10"><input type="checkbox" className="w-5 h-5" checked={f.wikiOnly} onChange={(e) => setFilter('wikiOnly', e.target.checked)} />Only with a Wikipedia article</label>
        </div>

        <details className="rounded-xl border border-stone-200">
          <summary className="p-3 cursor-pointer font-semibold">Progress by state ({perState.length})</summary>
          <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
            <thead><tr className="text-left bg-stone-50"><th className="p-2">State / UT</th><th className="p-2">Temples</th><th className="p-2">Published</th><th className="p-2">In progress</th><th className="p-2">Not started</th><th className="p-2">List fetched</th><th className="p-2" /></tr></thead>
            <tbody>{perState.map((s) => (
              <tr key={s.id} className="border-t border-stone-200">
                <td className="p-2"><button className="font-semibold underline" onClick={() => setFilter('state', s.id)}>{s.name}</button>{failed.includes(s.id) && <span className="ml-2 text-red-700">fetch failed</span>}</td>
                <td className="p-2">{s.total}</td><td className="p-2">{s.published}</td><td className="p-2">{s.working + s.queued}</td><td className="p-2">{s.todo}</td>
                <td className="p-2 text-muted">{d.updated[s.id] ? new Date(d.updated[s.id]).toLocaleDateString('en-IN') : '—'}</td>
                <td className="p-2"><button className="text-sm underline" disabled={!!job} onClick={() => build([s.id])}>Refresh</button></td>
              </tr>))}</tbody>
          </table></div>
          <div className="p-3 flex flex-wrap gap-2 items-center">
            <button className={btn} disabled={!!job} onClick={() => build()}>Refresh all states</button>
            {failed.length > 0 && <button className={btn} disabled={!!job} onClick={() => build(failed)}>Retry failed ({failed.length})</button>}
            {job && <span className="text-sm" role="status">{job}</span>}
          </div>
        </details>

        <div className="flex flex-wrap gap-2 items-center">
          <input aria-label="Search temples" placeholder="Search temple, town…" className={`${sel} flex-1 min-w-48`} value={f.q} onChange={(e) => setFilter('q', e.target.value)} />
          <select aria-label="State" className={sel} value={f.state} onChange={(e) => setFilter('state', e.target.value)}><option value="">All states</option>{d.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select aria-label="Progress" className={sel} value={f.prog} onChange={(e) => setFilter('prog', e.target.value)}>
            <option value="todo">Not started</option><option value="working">In Q-Locate (not published)</option><option value="queued">Importing</option><option value="published">Published</option><option value="skipped">Skipped</option><option value="active">All (except skipped)</option></select>
          <button className={btn} onClick={csv}>Download list (Excel / CSV)</button>
        </div>

        {picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-stone-100 text-sm">
            <b>{picked.size} selected</b>
            <button className={hot} onClick={() => importIds(shown.filter((t) => picked.has(t.id) && prog(t) === 'todo'))}>Import</button>
            {f.prog === 'skipped'
              ? <button className={btn} onClick={() => skipIds([...picked], false)}>Bring back</button>
              : <button className={btn} onClick={() => skipIds([...picked])}>Skip (not planning to publish)</button>}
          </div>
        )}
        {msg && <p className="m-0 text-sm" role="status">{msg}</p>}

        <p className="m-0 text-sm text-muted">{shown.length} temples{shown.length > 50 ? ` · showing ${page * 50 + 1}–${Math.min(shown.length, page * 50 + 50)}` : ''}</p>
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-stone-200 border border-stone-200 rounded-xl">
          {pageItems.map((t) => { const p = prog(t), s = d.status[t.id]; return (
            <li key={t.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
              <input type="checkbox" className="w-5 h-5 mt-0.5" aria-label={`Select ${t.name}`} checked={picked.has(t.id)} onChange={(e) => { const x = new Set(picked); if (e.target.checked) x.add(t.id); else x.delete(t.id); setPicked(x) }} />
              <div className="flex-1 min-w-56">
                <div className="font-semibold">{t.name} {t.faith === 'Jain' && <span className="text-xs font-normal">(Jain)</span>}</div>
                <div className="text-muted">{[t.district, t.state].filter(Boolean).join(', ')} · {built(t.year)}{heritageLabel(t) ? ` · ${heritageLabel(t)}` : ''}</div>
                {t.desc && <div className="text-muted text-xs">{t.desc}</div>}
                <div className="flex gap-3 text-xs mt-1"><a href={`https://www.wikidata.org/wiki/${t.id}`} target="_blank" rel="noreferrer">Wikidata ↗</a>{t.wiki && <a href={t.wiki} target="_blank" rel="noreferrer">Wikipedia ↗</a>}</div>
              </div>
              {s ? <Link to={`/admin/places/${s.id}`} className={`text-xs font-semibold px-2 py-1 rounded-full no-underline ${PROG[p][1]}`}>{PROG[p][0]}</Link>
                : <span className={`text-xs font-semibold px-2 py-1 rounded-full ${PROG[p][1]}`}>{PROG[p][0]}</span>}
            </li>) })}
        </ul>
        {shown.length > 50 && (
          <div className="flex gap-2 items-center">
            <button className={btn} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="text-sm">Page {page + 1} of {Math.ceil(shown.length / 50)}</span>
            <button className={btn} disabled={(page + 1) * 50 >= shown.length} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </>)}
    </section>
  )
}
