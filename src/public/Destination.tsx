import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Footer } from './Layout'
import {
  loadIndex, loadFestivals, loadMakers, regionOf, regionSlug, placeUrl, phoneDigits, festivalDates, festivalMonths, festivalInMonth, festivalOrder,
  type IndexPlace, type Festival, type Maker,
} from './data'
const PinMap = lazy(() => import('./PinMap'))

// /in/:region — everything published for one state (India) or country: places to see, temples, festivals, local makers, on one map.
export default function Destination() {
  const { region = '' } = useParams()
  const [all, setAll] = useState<IndexPlace[] | null>(null)
  const [fests, setFests] = useState<Festival[]>([])
  const [makers, setMakers] = useState<Maker[]>([])
  useEffect(() => { loadIndex().then(setAll); loadFestivals().then(setFests); loadMakers().then(setMakers) }, [])

  const places = useMemo(() => (all ?? []).filter((p) => regionSlug(regionOf(p)) === region), [all, region])
  const name = places[0] ? regionOf(places[0]) : region.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const explore = places.filter((p) => p.kind === 'vacation')
  const temples = places.filter((p) => p.kind === 'spiritual')
  const m = new Date().getMonth() + 1
  const soon = (f: Festival) => [0, 1, 2, 3].some((i) => festivalInMonth(f, ((m - 1 + i) % 12) + 1))
  const fs = fests.filter((f) => regionSlug(regionOf({ country: f.country ?? '', state: f.state ?? '' })) === region && soon(f)).sort((a, b) => festivalOrder(a) - festivalOrder(b))
  const mk = makers.filter((x) => regionSlug(regionOf({ country: x.country ?? '', state: x.state ?? '' })) === region)
  const pins = useMemo(() => places.filter((p) => p.lat != null && p.lng != null).map((p) => ({ lat: p.lat!, lng: p.lng!, name: p.name, to: placeUrl(p), dark: p.kind === 'spiritual' })), [places])

  useEffect(() => { document.title = `${name} — Q-Locate`; return () => { document.title = 'Q-Locate — Quick location guide' } }, [name])

  const H = ({ children, n }: { children: React.ReactNode; n?: number }) => <h2 className="m-0 mb-3 text-xl font-bold font-display">{children}{n ? <span className="text-muted font-normal text-base"> · {n}</span> : null}</h2>
  const Card = ({ p }: { p: IndexPlace }) => {
    const dark = p.kind === 'spiritual'
    return (
      <li><Link to={placeUrl(p)} className="flex items-center gap-3 p-3 bg-white rounded-2xl no-underline text-ink">
        <div className={`w-16 h-16 shrink-0 rounded-xl overflow-hidden ${dark ? 'bg-[#F3E3CC]' : 'bg-[#DDE8DD]'}`}>{p.thumb && <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-bold leading-snug ${dark ? 'font-serif text-maroon' : 'font-display'}`}>{p.name}</div>
          <div className="text-sm text-muted truncate">{[dark ? p.deity : '', p.city || p.district_city].filter(Boolean).join(' · ')}</div>
          {p.summary && <div className="text-xs mt-0.5 line-clamp-2">{p.summary}</div>}
        </div>
        {!dark && p.best_months.includes(m) && <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-forest/10 text-forest">In season</span>}
      </Link></li>
    )
  }

  return (
    <main className="flex flex-col gap-6 pt-5 pb-2">
      <header className="px-5 flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="Back to home" className="w-11 h-11 -ml-2 grid place-items-center rounded-full text-ink no-underline text-2xl">‹</Link>
          <h1 className="m-0 text-3xl font-bold font-display tracking-tight text-forest leading-tight">{name}</h1>
        </div>
        {all !== null && <p className="m-0 text-muted">{[explore.length && `${explore.length} ${explore.length === 1 ? 'place' : 'places'} to see`, temples.length && `${temples.length} ${temples.length === 1 ? 'temple' : 'temples'}`, fs.length && `${fs.length} ${fs.length === 1 ? 'festival' : 'festivals'} coming up`].filter(Boolean).join(' · ') || 'Places here are being added. Check back soon.'}</p>}
      </header>

      {all === null && <p className="m-0 px-5">Loading…</p>}

      {pins.length > 0 && (
        <section className="px-5">
          <Suspense fallback={<div className="h-64 rounded-2xl bg-[#E8EFE8]" />}><PinMap pins={pins} /></Suspense>
          <p className="m-0 mt-2 text-xs text-muted flex gap-4"><span><span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-forest align-middle mr-1" />Places to see</span><span><span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-maroon align-middle mr-1" />Temples</span><span>Tap a dot to open it.</span></p>
        </section>
      )}

      {explore.length > 0 && <section className="px-5"><H n={explore.length}>Places to see</H><ul className="list-none m-0 p-0 flex flex-col gap-2">{explore.map((p) => <Card key={p.slug} p={p} />)}</ul></section>}
      {temples.length > 0 && <section className="px-5"><H n={temples.length}>Temples</H><ul className="list-none m-0 p-0 flex flex-col gap-2">{temples.map((p) => <Card key={p.slug} p={p} />)}</ul></section>}

      {fs.length > 0 && (
        <section className="px-5"><H>Festivals in the next few months</H>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {fs.map((f) => (
              <li key={f.slug} className="p-3 rounded-2xl bg-white">
                <div className="flex flex-wrap items-baseline gap-x-2"><Link to={`/festivals?month=all${f.country && f.country !== 'India' ? '&scope=intl' : ''}&q=${encodeURIComponent(f.name)}`} className="font-bold">{f.name}</Link>
                  <span className="text-sm font-semibold text-plum">{festivalDates(f) ?? festivalMonths(f)}</span></div>
                {f.summary && <div className="text-sm mt-1 line-clamp-2">{f.summary}</div>}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs text-muted">Festival dates can shift — please confirm locally before you travel.</p>
        </section>
      )}

      {mk.length > 0 && (
        <section className="px-5"><H n={mk.length}>Vocal for Local</H>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {mk.slice(0, 8).map((x) => (
              <li key={x.slug} className="p-3 rounded-2xl bg-white flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex-1 min-w-48"><b>{x.name}</b> <span className="text-sm text-muted">· {x.village || x.district}</span><div className="text-sm">{x.products}</div></div>
                {x.phone && <a className="text-sm font-semibold" href={`tel:+${phoneDigits(x.phone)}`}>Call</a>}
              </li>
            ))}
          </ul>
          {mk.length > 8 && <Link to="/makers" className="inline-block mt-2 font-semibold">See all {mk.length} →</Link>}
          <p className="m-0 mt-2 text-xs text-muted">Listed for information; Q-Locate doesn’t sell or handle payments.</p>
        </section>
      )}

      {places.length > 0 && (
        <div role="note" className="mx-5 p-3 rounded-xl bg-[#FFF7E6] border border-[#F2D7A6] text-sm leading-relaxed">
          <b>Please confirm before you travel.</b> Timings, prices, access and contacts can change — open each place for details and verify with official sources.
        </div>
      )}
      <Footer />
    </main>
  )
}

