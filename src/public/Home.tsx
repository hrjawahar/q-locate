import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { Footer } from './Layout'
import MiniSearch from 'minisearch'
import { loadIndex, loadMovies, loadBooks, makeSearch, savedPlaces, placeUrl, where, type IndexPlace, type Place, type Movie, type Book } from './data'
import { CONFIG } from './config'
import { snippet, processTerm, expand } from './searchkit'

export default function Home() {
  const [places, setPlaces] = useState<IndexPlace[]>([])
  const [saved, setSaved] = useState<Place[]>([])
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const [movies, setMovies] = useState<Movie[]>([])
  const [books, setBooks] = useState<Book[]>([])
  useEffect(() => { loadIndex().then(setPlaces); savedPlaces().then(setSaved); loadMovies().then(setMovies); loadBooks().then(setBooks) }, [])
  const search = useMemo(() => makeSearch(places), [places])
  const bySlug = useMemo(() => new Map(places.map((p) => [p.slug, p])), [places])
  const results = q.trim().length >= 2 ? search(q).slice(0, 8).map((s) => bySlug.get(s)!).filter(Boolean) : []
  // Movies and books are searched too, so a word like "aviation" or "habits" finds them from Home.
  const picks = useMemo(() => {
    const mk = <T extends { slug: string }>(xs: T[], fields: string[], doc: (x: T) => Record<string, unknown>) => {
      const ms = new MiniSearch<Record<string, unknown>>({ idField: 'slug', fields, processTerm, searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 4 } } })
      ms.addAll(xs.map(doc)); return ms
    }
    return {
      m: mk(movies, ['title', 'g', 'doc_topic', 'pitch', 'country'], (m) => ({ ...m, g: m.genres.join(' ') })),
      b: mk(books, ['title', 'author', 'g', 'topic', 'pitch'], (b) => ({ ...b, g: b.genres.join(' ') })),
    }
  }, [movies, books])
  const pickHits = q.trim().length >= 2 ? [
    ...picks.m.search(expand(q)).slice(0, 3).map((r) => ({ kind: 'Movie', title: movies.find((m) => m.slug === r.id)?.title ?? '', to: `/movies?q=${encodeURIComponent(q)}` })),
    ...picks.b.search(expand(q)).slice(0, 3).map((r) => ({ kind: 'Book', title: books.find((b) => b.slug === r.id)?.title ?? '', to: `/books?q=${encodeURIComponent(q)}` })),
  ] : []

  return (
    <main className="flex flex-col gap-5 px-5 pt-7">
      <header className="flex items-center gap-3">
        <LogoMark size={40} bg="#F5EFE2" />
        <div>
          <div className="font-display text-2xl font-bold tracking-tight leading-none"><span className="text-forest">Q</span><span className="text-saffron">-</span>Locate</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted mt-1">Quick location guide</div>
        </div>
      </header>
      <h1 className="m-0 font-display text-[26px] font-semibold tracking-tight">Where to next?</h1>
      <div className="relative">
        <label className="flex items-center gap-3 h-13 px-4 bg-white border border-stone-300 rounded-2xl">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B6B5E" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
          <input type="search" aria-label="Search places and temples" placeholder="Search a place, state or temple" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) nav(placeUrl(results[0])) }}
            className="flex-1 h-12 bg-transparent outline-none text-base" />
        </label>
        {(results.length > 0 || pickHits.length > 0) && (
          <ul className="absolute z-10 left-0 right-0 mt-2 list-none p-0 m-0 bg-white rounded-2xl border border-stone-200 shadow-lg overflow-hidden">
            {results.map((p) => (
              <li key={p.slug}><Link to={placeUrl(p)} className="flex items-center gap-3 px-4 py-3 no-underline text-ink hover:bg-stone-50">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${p.kind === 'spiritual' ? 'bg-saffron/20 text-maroon' : 'bg-forest/10 text-forest'}`}>{p.kind === 'spiritual' ? 'Darshan' : 'Explore'}</span>
                <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{p.name}</span><span className="block text-sm text-muted truncate">{where(p)}</span>{(() => { const sn = snippet(p.text, q); return sn && !p.name.toLowerCase().includes(q.trim().toLowerCase()) ? <span className="block text-xs text-ink/80 line-clamp-2">{sn}</span> : null })()}</span>
              </Link></li>
            ))}
            {pickHits.map((h, i) => (
              <li key={`p${i}`}><Link to={h.to} className="flex items-center gap-3 px-4 py-3 no-underline text-ink hover:bg-stone-50">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-ink text-white">{h.kind}</span>
                <span className="flex-1 min-w-0 font-semibold truncate">{h.title}</span>
              </Link></li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && results.length === 0 && pickHits.length === 0 && places.length > 0 && <p className="m-0 mt-2 text-sm text-muted">No match for “{q}”. Try another spelling or a state name.</p>}
      </div>

      <Link to="/explore" className="relative overflow-hidden flex flex-col justify-end gap-1 h-44 p-5 rounded-3xl bg-forest text-white no-underline">
        <svg width="230" height="120" viewBox="0 0 230 120" fill="none" aria-hidden="true" className="absolute -right-2 top-1"><circle cx="186" cy="30" r="14" stroke="#F2B35C" strokeWidth="3" /><path d="M0 112C40 84 78 80 112 94C146 108 186 86 230 70" stroke="#fff" strokeOpacity=".3" strokeWidth="3" strokeLinecap="round" /><path d="M96 92L114 52L132 92ZM126 98L148 46L170 98ZM160 88L176 58L192 88Z" stroke="#fff" strokeOpacity=".4" strokeWidth="3" strokeLinejoin="round" /></svg>
        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#CFE3D2]">Vacation</span>
        <span className="font-display text-3xl font-bold tracking-tight">Explore</span>
        <span className="text-[15px] text-[#E4F0E5]">Forests, hill stations, beaches</span>
      </Link>
      <Link to="/darshan" className="relative overflow-hidden flex flex-col justify-end gap-1 h-44 p-5 rounded-3xl bg-saffron text-maroon no-underline">
        <svg width="150" height="130" viewBox="0 0 150 130" fill="none" aria-hidden="true" className="absolute right-4 top-1"><path d="M20 128V96H36V70H52V46H64V22H86V46H98V70H114V96H130V128M75 22V6" stroke="#4A1320" strokeOpacity=".35" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></svg>
        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#4A1320]">Spiritual</span>
        <span className="font-serif text-3xl font-bold">Darshan</span>
        <span className="text-[15px]">Temples, timings, sacred circuits</span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/movies" className="flex flex-col gap-1 p-4 bg-ink text-white rounded-2xl no-underline">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F2B35C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v14H4zM4 9h16M8 5l2 4M13 5l2 4M10 12.5v4l3.5-2z" /></svg>
          <span className="font-bold">Movie Picks</span><span className="text-xs text-white/75">For your weekend</span>
        </Link>
        <Link to="/books" className="flex flex-col gap-1 p-4 bg-[#3B2A1F] text-white rounded-2xl no-underline">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F2B35C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20M8 7h8" /></svg>
          <span className="font-bold">Book Picks</span><span className="text-xs text-white/75">Your next read</span>
        </Link>
      </div>
      <Link to="/community" className="flex items-center gap-4 p-4 bg-white border border-dashed border-stone-300 rounded-2xl no-underline text-ink">
        <span className="w-11 h-11 shrink-0 rounded-xl bg-[#FBE7CC] grid place-items-center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9A560B" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11.5a2.5 2.5 0 1 0 0-5M16 14.2c3.1.2 5.5 2.4 5.5 5.8" /></svg></span>
        <span className="flex-1"><span className="flex items-center gap-2 font-bold">Q-Locate Community {!CONFIG.whatsappChannel && <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A4C08] bg-[#FBE7CC] px-2 py-0.5 rounded-full">Soon</span>}</span>
          <span className="block text-sm text-muted">Tips from travellers and pilgrims</span></span>
        <span className="h-11 px-3 grid place-items-center rounded-xl border-[1.5px] border-forest text-forest font-bold text-sm">Join</span>
      </Link>

      {saved.length > 0 && (
        <section>
          <h2 className="m-0 mb-3 font-display text-lg font-semibold">Your saved places</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {saved.map((p) => (
              <Link key={p.slug} to={placeUrl(p as never)} className="shrink-0 w-40 no-underline text-ink">
                <div className="w-40 h-24 rounded-xl bg-stone-200 overflow-hidden">{p.cover?.thumb && <img src={p.cover.thumb} alt="" className="w-full h-full object-cover" />}</div>
                <div className="mt-1 text-sm font-semibold truncate">{p.name}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <Footer />
    </main>
  )
}
