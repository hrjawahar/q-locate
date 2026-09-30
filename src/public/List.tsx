import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Footer } from './Layout'
import { loadIndex, loadMeta, makeSearch, openNow, placeUrl, where, MONTHS, ACCESS, VISIT, type IndexPlace, type Kind, type Meta } from './data'

const selectCls = 'h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-[15px]'

export default function List({ kind }: { kind: Kind }) {
  const dark = kind === 'spiritual'
  const [all, setAll] = useState<IndexPlace[] | null>(null)
  const [meta, setMeta] = useState<Meta>({ categories: [], circuits: [] })
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => { loadIndex().then(setAll); loadMeta().then(setMeta) }, [])

  const get = (k: string) => params.get(k) ?? ''
  const setF = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }
  const scope = get('scope') || 'india'
  const cat = get('cat'), region = get('region'), month = get('month'), visit = get('visit'), access = get('access'), deity = get('deity'), circuit = get('circuit')

  const mine = useMemo(() => (all ?? []).filter((p) => p.kind === kind && (scope === 'india' ? p.country === 'India' : p.country !== 'India')), [all, kind, scope])
  const search = useMemo(() => makeSearch(mine), [mine])
  const regions = useMemo(() => [...new Set(mine.map((p) => (scope === 'india' ? p.state : p.country)).filter(Boolean))].sort(), [mine, scope])
  const deities = useMemo(() => [...new Set(mine.map((p) => p.deity).filter(Boolean))].sort(), [mine])
  const cats = meta.categories.filter((c) => c.kind === kind && mine.some((p) => p.categories.includes(c.slug)))
  const circuits = meta.circuits.filter((c) => mine.some((p) => p.circuits.includes(c.slug)))

  const shown = useMemo(() => {
    let xs = mine
    if (q.trim().length >= 2) { const order = search(q); const set = new Map(order.map((s, i) => [s, i])); xs = xs.filter((p) => set.has(p.slug)).sort((a, b) => set.get(a.slug)! - set.get(b.slug)!) }
    else xs = [...xs].sort((a, b) => a.name.localeCompare(b.name))
    return xs.filter((p) => (!cat || p.categories.includes(cat)) && (!region || (scope === 'india' ? p.state : p.country) === region)
      && (!month || p.best_months.includes(Number(month))) && (!visit || p.typical_visit === visit)
      && (!access || (access === 'no_climb' ? p.access_effort !== 'steps_climb' && p.access_effort !== 'trek' : p.access_effort === access))
      && (!deity || p.deity === deity) && (!circuit || p.circuits.includes(circuit)))
  }, [mine, search, q, cat, region, month, visit, access, deity, circuit, scope])
  const activeFilters = [region, month, visit, access, deity, circuit].filter(Boolean).length

  const chip = (on: boolean) => `shrink-0 h-10 px-4 rounded-full border text-sm font-semibold ${on
    ? (dark ? 'bg-maroon text-white border-maroon' : 'bg-forest text-white border-forest')
    : 'bg-white border-stone-300 text-ink'}`

  return (
    <main className={`flex flex-col gap-4 pt-5 ${dark ? 'font-body' : ''}`}>
      <header className="px-5 flex items-center gap-3">
        <Link to="/" aria-label="Back to home" className="w-11 h-11 -ml-2 grid place-items-center rounded-full text-ink no-underline text-2xl">‹</Link>
        <h1 className={`m-0 text-3xl font-bold ${dark ? 'font-serif text-maroon' : 'font-display tracking-tight text-forest'}`}>{dark ? 'Darshan' : 'Explore'}</h1>
      </header>

      <div className="grid grid-cols-2 p-1 mx-5 rounded-2xl bg-white border border-stone-200" role="tablist" aria-label="India or international">
        {[['india', 'India'], ['intl', 'International']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={scope === k} onClick={() => { const p = new URLSearchParams(); if (k !== 'india') p.set('scope', k); setParams(p, { replace: true }) }}
            className={`h-11 rounded-xl font-semibold ${scope === k ? (dark ? 'bg-saffron text-maroon' : 'bg-forest text-white') : 'text-muted'}`}>{l}</button>
        ))}
      </div>

      <div className="px-5 flex gap-2">
        <label className="flex-1 flex items-center gap-2 h-12 px-4 bg-white border border-stone-300 rounded-2xl">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6B5E" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
          <input type="search" aria-label="Search" placeholder={dark ? 'Temple, deity or town' : 'Place, state or keyword'} value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent outline-none text-base" />
        </label>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="h-12 px-4 rounded-2xl bg-white border border-stone-300 font-semibold">Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
      </div>

      {open && (
        <div className="mx-5 p-4 rounded-2xl bg-white border border-stone-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm font-semibold flex flex-col gap-1">{scope === 'india' ? 'State' : 'Country'}
            <select className={selectCls} value={region} onChange={(e) => setF('region', e.target.value)}><option value="">All</option>{regions.map((r) => <option key={r}>{r}</option>)}</select></label>
          {dark ? (<>
            <label className="text-sm font-semibold flex flex-col gap-1">Deity<select className={selectCls} value={deity} onChange={(e) => setF('deity', e.target.value)}><option value="">All</option>{deities.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="text-sm font-semibold flex flex-col gap-1">Temple circuit<select className={selectCls} value={circuit} onChange={(e) => setF('circuit', e.target.value)}><option value="">All</option>{circuits.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
            <label className="text-sm font-semibold flex flex-col gap-1">Access<select className={selectCls} value={access} onChange={(e) => setF('access', e.target.value)}><option value="">Any</option><option value="no_climb">No steep climb or trek</option></select></label>
          </>) : (<>
            <label className="text-sm font-semibold flex flex-col gap-1">Good to visit in<select className={selectCls} value={month} onChange={(e) => setF('month', e.target.value)}><option value="">Any month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}{i === new Date().getMonth() ? ' (this month)' : ''}</option>)}</select></label>
            <label className="text-sm font-semibold flex flex-col gap-1">Typical visit<select className={selectCls} value={visit} onChange={(e) => setF('visit', e.target.value)}><option value="">Any</option>{Object.entries(VISIT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="text-sm font-semibold flex flex-col gap-1">Access effort<select className={selectCls} value={access} onChange={(e) => setF('access', e.target.value)}><option value="">Any</option>{Object.entries(ACCESS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </>)}
          {activeFilters > 0 && <button className="sm:col-span-2 h-11 rounded-xl border border-stone-300 font-semibold" onClick={() => { const p = new URLSearchParams(); if (scope !== 'india') p.set('scope', scope); if (cat) p.set('cat', cat); setParams(p, { replace: true }) }}>Clear filters</button>}
        </div>
      )}

      {cats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Categories">
          <button className={chip(!cat)} onClick={() => setF('cat', '')}>All</button>
          {cats.map((c) => <button key={c.slug} className={chip(cat === c.slug)} onClick={() => setF('cat', cat === c.slug ? '' : c.slug)}>{c.name}</button>)}
        </div>
      )}

      <p className="m-0 px-5 text-sm text-muted" role="status">{all === null ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'place' : 'places'}`}</p>

      {all !== null && shown.length === 0 && (
        <div className="mx-5 p-5 rounded-2xl bg-white text-center">
          <p className="m-0 font-semibold">Nothing matches yet.</p>
          <p className="m-0 mt-1 text-sm text-muted">{mine.length ? 'Try another spelling, or clear a filter.' : 'Places for this section are being added. Check back soon.'}</p>
        </div>
      )}

      {dark ? (
        <ul className="list-none m-0 px-5 flex flex-col gap-2">
          {shown.map((p) => { const o = openNow(p.hours, p.country); return (
            <li key={p.slug}><Link to={placeUrl(p)} className="flex items-center gap-3 p-3 bg-white rounded-2xl no-underline text-ink">
              <div className="w-16 h-16 shrink-0 rounded-xl bg-[#F3E3CC] overflow-hidden">{p.thumb && <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />}</div>
              <div className="flex-1 min-w-0">
                <div className="font-serif text-[17px] font-bold text-maroon leading-snug">{p.name}</div>
                <div className="text-sm text-muted truncate">{[p.deity, where(p)].filter(Boolean).join(' · ')}</div>
              </div>
              {o !== null && <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full ${o ? 'bg-green-100 text-green-900' : 'bg-stone-200 text-stone-700'}`}>{o ? 'Open now' : 'Closed'}</span>}
            </Link></li>
          ) })}
        </ul>
      ) : (
        <ul className="list-none m-0 px-5 grid grid-cols-2 gap-3">
          {shown.map((p) => (
            <li key={p.slug}><Link to={placeUrl(p)} className="block bg-white rounded-2xl overflow-hidden no-underline text-ink h-full">
              <div className="aspect-[4/3] bg-[#DDE8DD]">{p.thumb && <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />}</div>
              <div className="p-3">
                <div className="font-display font-semibold leading-snug">{p.name}</div>
                <div className="text-xs text-muted mt-0.5 truncate">{where(p)}</div>
                {p.best_months.includes(new Date().getMonth() + 1) && <div className="mt-2 inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-forest/10 text-forest">In season</div>}
              </div>
            </Link></li>
          ))}
        </ul>
      )}
      <Footer />
    </main>
  )
}
