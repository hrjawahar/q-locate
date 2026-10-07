import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import { Link, useSearchParams } from 'react-router-dom'
import { loadFestivals, festivalDates, festivalMonths, festivalInMonth, festivalOrder, placeUrl, MONTHS, type Festival } from './data'
import { processTerm, expand } from './searchkit'
import { useSemantic } from './useSemantic'
import { Footer } from './Layout'

const chip = (on: boolean) => `shrink-0 h-10 px-4 rounded-full border text-sm font-semibold ${on ? 'bg-plum text-white border-plum' : 'bg-white border-stone-300 text-ink'}`
const sel = 'h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-[15px]'
export const KIND_LABEL: Record<string, string> = { religious: 'Religious', cultural: 'Cultural', both: 'Religious & cultural' }

export function FestivalCard({ f, highlight }: { f: Festival; highlight?: boolean }) {
  const dates = festivalDates(f)
  return (
    <li id={`f-${f.slug}`} className={`p-4 rounded-2xl bg-white flex flex-col gap-2 ${highlight ? 'ring-4 ring-saffron' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${dates ? 'bg-plum text-white' : 'bg-plum/10 text-plum'}`}>{dates ?? festivalMonths(f)}</span>
        {f.kind && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-sand">{KIND_LABEL[f.kind]}</span>}
      </div>
      <div>
        <h2 className="m-0 font-display text-xl font-bold leading-snug">{f.name}</h2>
        <div className="text-sm text-muted">{[f.towns, f.state, f.country].filter(Boolean).join(' · ')}</div>
      </div>
      {f.summary && <p className="m-0 text-[16px] leading-relaxed">{f.summary}</p>}
      {f.tips && <p className="m-0 text-sm p-3 rounded-xl bg-[#FBF3E6]"><b>Good to know:</b> {f.tips}</p>}
      {f.places.length > 0 && (
        <div className="text-sm flex flex-wrap gap-x-3 gap-y-1"><span className="text-muted">See:</span>
          {f.places.map((p) => <Link key={p.slug} to={placeUrl(p as never)} className="font-semibold">{p.name}</Link>)}</div>
      )}
      <p className="m-0 text-xs text-muted">{dates ? `Dates as published${f.dates_checked_on ? ` (checked ${new Date(f.dates_checked_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}. ` : ''}Festival dates can shift — please confirm locally before you travel.</p>
    </li>
  )
}

export default function Festivals() {
  const [all, setAll] = useState<Festival[] | null>(null)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  useEffect(() => { loadFestivals().then(setAll); document.title = 'Festivals — Q-Locate'; return () => { document.title = 'Q-Locate — Quick location guide' } }, [])
  const get = (k: string) => params.get(k) ?? ''
  const setF = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }
  const nowMonth = new Date().getMonth() + 1
  const month = get('month') || (q ? 'all' : String(nowMonth))
  const scope = get('scope') || 'india', region = get('region'), type = get('type')

  const mine = useMemo(() => (all ?? []).filter((f) => (scope === 'india' ? f.country === 'India' : f.country !== 'India')), [all, scope])
  const regions = useMemo(() => [...new Set(mine.map((f) => (scope === 'india' ? f.state : f.country)).filter(Boolean) as string[])].sort(), [mine, scope])
  const ms = useMemo(() => {
    const s = new MiniSearch<Festival & { m: string; p: string }>({ idField: 'slug', fields: ['name', 'alt_names', 'country', 'state', 'towns', 'summary', 'tips', 'm', 'p'], storeFields: ['slug'], processTerm,
      searchOptions: { prefix: true, fuzzy: 0.15, boost: { name: 4, alt_names: 3, state: 2, towns: 2, m: 2 } } })
    // Month names (full and short) are searchable, so "october" or "oct" finds that month's festivals.
    const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    s.addAll(mine.map((f) => ({ ...f, m: f.months.map((x) => `${full[x - 1]} ${MONTHS[x - 1]}`).join(' '), p: f.places.map((p) => p.name).join(' ') })))
    return s
  }, [mine])

  const shown = useMemo(() => {
    let xs = mine
    if (q.trim().length >= 2) { const ids = ms.search(expand(q)).map((r) => r.id as string); const rank = new Map(ids.map((s, i) => [s, i])); xs = xs.filter((f) => rank.has(f.slug)) }
    xs = xs.filter((f) => (!region || (scope === 'india' ? f.state : f.country) === region)
      && (!type || f.kind === type || f.kind === 'both')
      && (month === 'all' || month === 'upcoming' || festivalInMonth(f, Number(month))))
    return [...xs].sort((a, b) => festivalOrder(a) - festivalOrder(b)).slice(0, month === 'upcoming' ? 30 : 500)
  }, [mine, ms, q, region, type, month, scope])

  // Bring the chosen month chip into view on the strip.
  useEffect(() => { document.querySelector('[data-on]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [month, all])
  const sem = useSemantic(q)
  const closest = useMemo(() => {
    const listed = new Set(shown.map((f) => f.slug))
    return sem.filter((h) => h.type === 'festival' && !listed.has(h.slug)).map((h) => (all ?? []).find((f) => f.slug === h.slug)).filter((f): f is Festival => !!f).slice(0, 6)
  }, [sem, shown, all])

  return (
    <main className="flex flex-col gap-4 pt-5">
      <header className="px-5 flex items-center gap-3">
        <Link to="/" aria-label="Back to home" className="w-11 h-11 -ml-2 grid place-items-center rounded-full text-ink no-underline text-2xl">‹</Link>
        <div>
          <h1 className="m-0 font-display text-3xl font-bold tracking-tight text-plum">Festivals</h1>
          <p className="m-0 text-sm text-muted">Plan a trip around a celebration</p>
        </div>
      </header>

      <div className="grid grid-cols-2 p-1 mx-5 rounded-2xl bg-white border border-stone-200" role="tablist" aria-label="India or international">
        {[['india', 'India'], ['intl', 'International']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={scope === k} onClick={() => { const p = new URLSearchParams(params); p.delete('region'); if (k === 'india') p.delete('scope'); else p.set('scope', k); setParams(p, { replace: true }) }}
            className={`h-11 rounded-xl font-semibold ${scope === k ? 'bg-plum text-white' : 'text-muted'}`}>{l}</button>
        ))}
      </div>

      <label className="mx-5 flex items-center gap-2 h-12 px-4 bg-white border border-stone-300 rounded-2xl">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6B5E" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
        <input type="search" aria-label="Search festivals" placeholder="Festival, state, town or month" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-0 bg-transparent outline-none text-base" />
      </label>

      <div className="flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Month">
        <button className={chip(month === 'upcoming')} onClick={() => setF('month', 'upcoming')}>Upcoming</button>
        {MONTHS.map((m, i) => <button key={m} data-on={month === String(i + 1) || undefined} className={chip(month === String(i + 1))} onClick={() => setF('month', String(i + 1))}>{m}{i + 1 === nowMonth ? ' •' : ''}</button>)}
        <button className={chip(month === 'all')} onClick={() => setF('month', 'all')}>All year</button>
      </div>

      <div className="px-5 grid grid-cols-2 gap-2">
        <select aria-label="Type" className={sel} value={type} onChange={(e) => setF('type', e.target.value)}><option value="">All types</option><option value="religious">Religious</option><option value="cultural">Cultural</option></select>
        <select aria-label={scope === 'india' ? 'State' : 'Country'} className={sel} value={region} onChange={(e) => setF('region', e.target.value)}><option value="">{scope === 'india' ? 'All states' : 'All countries'}</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
      </div>

      <p className="m-0 px-5 text-sm text-muted" role="status">{all === null ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'festival' : 'festivals'}${month === 'upcoming' ? ' coming up' : month === 'all' ? '' : ` in ${MONTHS[Number(month) - 1]}`}`}</p>

      {all !== null && shown.length === 0 && closest.length === 0 && (
        <div className="mx-5 p-5 rounded-2xl bg-white text-center"><p className="m-0 font-semibold">{mine.length ? 'No festivals match.' : 'Festivals are being added. Check back soon.'}</p>
          {mine.length > 0 && <p className="m-0 mt-1 text-sm text-muted">Try another month or “All year”.</p>}</div>
      )}
      <ul className="list-none m-0 px-5 flex flex-col gap-3">{shown.map((f) => <FestivalCard key={f.slug} f={f} />)}</ul>
      {closest.length > 0 && (
        <section className="px-5 flex flex-col gap-2" aria-label="Closest matches">
          <h2 className="m-0 text-sm font-bold uppercase tracking-wider text-muted">Closest matches</h2>
          <ul className="list-none m-0 p-0 flex flex-col gap-3">{closest.map((f) => <FestivalCard key={f.slug} f={f} />)}</ul>
        </section>
      )}
      <Footer />
    </main>
  )
}
