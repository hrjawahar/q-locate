import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import { Link, useSearchParams } from 'react-router-dom'
import { loadMakers, phoneDigits, type Maker } from './data'
import { processTerm, expand } from './searchkit'
import { useSemantic } from './useSemantic'
import { Footer } from './Layout'

const chip = (on: boolean) => `shrink-0 h-10 px-4 rounded-full border text-sm font-semibold ${on ? 'bg-indigo text-white border-indigo' : 'bg-white border-stone-300 text-ink'}`

export function MakerCard({ m }: { m: Maker }) {
  return (
    <li className="p-4 rounded-2xl bg-white flex flex-col gap-2">
      {m.category && <span className="self-start text-xs font-semibold px-2 py-1 rounded-full bg-indigo/10 text-indigo">{m.category}</span>}
      <div>
        <h2 className="m-0 font-display text-lg font-bold leading-snug">{m.name}</h2>
        <div className="text-sm text-muted">{[m.village, m.district, m.state, m.country !== 'India' ? m.country : ''].filter(Boolean).join(', ')}</div>
      </div>
      {m.products && <p className="m-0 text-[16px]"><b>Products:</b> {m.products}</p>}
      {m.about && <p className="m-0 text-sm">{m.about}</p>}
      {m.phone && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a href={`tel:+${phoneDigits(m.phone)}`} className="h-11 px-5 grid place-items-center rounded-xl bg-indigo text-white font-semibold no-underline whitespace-nowrap">Call</a>
          <a href={`https://wa.me/${phoneDigits(m.phone)}`} target="_blank" rel="noreferrer" className="h-11 px-4 grid place-items-center rounded-xl border border-stone-300 font-semibold no-underline text-ink whitespace-nowrap">WhatsApp</a>
          <span className="text-sm text-muted">{m.phone}</span>
        </div>
      )}
    </li>
  )
}

export default function Makers() {
  const [all, setAll] = useState<Maker[] | null>(null)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const cat = params.get('cat') ?? '', region = params.get('region') ?? ''
  const setF = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }
  useEffect(() => { loadMakers().then(setAll); document.title = 'Local Makers — Q-Locate'; return () => { document.title = 'Q-Locate — Quick location guide' } }, [])

  const cats = useMemo(() => [...new Set((all ?? []).map((m) => m.category).filter(Boolean) as string[])].sort(), [all])
  const regions = useMemo(() => [...new Set((all ?? []).map((m) => m.state).filter(Boolean) as string[])].sort(), [all])
  const ms = useMemo(() => {
    const s = new MiniSearch<Maker>({ idField: 'slug', fields: ['name', 'products', 'category', 'village', 'district', 'state', 'country', 'about'], storeFields: ['slug'], processTerm,
      searchOptions: { prefix: true, fuzzy: 0.15, boost: { products: 3, name: 2, village: 2, district: 2 } } })
    s.addAll(all ?? []); return s
  }, [all])
  const shown = useMemo(() => {
    let xs = all ?? []
    if (q.trim().length >= 2) { const ids = ms.search(expand(q)).map((r) => r.id as string); const rank = new Map(ids.map((s, i) => [s, i])); xs = xs.filter((m) => rank.has(m.slug)).sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!) }
    return xs.filter((m) => (!cat || m.category === cat) && (!region || m.state === region))
  }, [all, ms, q, cat, region])
  const sem = useSemantic(q)
  const closest = useMemo(() => {
    const listed = new Set(shown.map((m) => m.slug))
    return sem.filter((h) => h.type === 'maker' && !listed.has(h.slug)).map((h) => (all ?? []).find((m) => m.slug === h.slug)).filter((m): m is Maker => !!m).slice(0, 6)
  }, [sem, shown, all])

  return (
    <main className="flex flex-col gap-4 pt-5">
      <header className="px-5 flex items-center gap-3">
        <Link to="/" aria-label="Back to home" className="w-11 h-11 -ml-2 grid place-items-center rounded-full text-ink no-underline text-2xl">‹</Link>
        <div>
          <h1 className="m-0 font-display text-3xl font-bold tracking-tight text-indigo">Local Makers</h1>
          <p className="m-0 text-sm text-muted">Farmers, weavers and artisans — contact them directly</p>
        </div>
      </header>
      <label className="mx-5 flex items-center gap-2 h-12 px-4 bg-white border border-stone-300 rounded-2xl">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6B5E" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
        <input type="search" aria-label="Search makers" placeholder="Product, village or district" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-0 bg-transparent outline-none text-base" />
      </label>
      {cats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Category">
          <button className={chip(!cat)} onClick={() => setF('cat', '')}>All</button>
          {cats.map((c) => <button key={c} className={chip(cat === c)} onClick={() => setF('cat', cat === c ? '' : c)}>{c}</button>)}
        </div>
      )}
      {regions.length > 1 && (
        <div className="px-5"><select aria-label="State" className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-[15px]" value={region} onChange={(e) => setF('region', e.target.value)}>
          <option value="">All states</option>{regions.map((r) => <option key={r}>{r}</option>)}</select></div>
      )}
      <p className="m-0 px-5 text-sm text-muted" role="status">{all === null ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'maker' : 'makers'}`}</p>
      {all !== null && shown.length === 0 && closest.length === 0 && (
        <div className="mx-5 p-5 rounded-2xl bg-white text-center"><p className="m-0 font-semibold">{all.length ? 'No makers match.' : 'Local Makers are being added. Check back soon.'}</p></div>
      )}
      <ul className="list-none m-0 px-5 flex flex-col gap-3">{shown.map((m) => <MakerCard key={m.slug} m={m} />)}</ul>
      {closest.length > 0 && (
        <section className="px-5 flex flex-col gap-2" aria-label="Closest matches">
          <h2 className="m-0 text-sm font-bold uppercase tracking-wider text-muted">Closest matches</h2>
          <ul className="list-none m-0 p-0 flex flex-col gap-3">{closest.map((m) => <MakerCard key={m.slug} m={m} />)}</ul>
        </section>
      )}
      <p className="m-0 px-5 pt-2 text-xs text-muted leading-relaxed">Q-Locate lists makers for information only and does not sell, take orders or handle payments. Please agree price, quality and delivery directly with the maker before paying.</p>
      <Footer />
    </main>
  )
}
