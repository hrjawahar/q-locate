import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import { Link, useSearchParams } from 'react-router-dom'
import { loadBooks, type Book } from './data'
import { processTerm, expand } from './searchkit'
import PicksSwitch from './PicksSwitch'

const LENGTHS: [string, string, (p: number) => boolean][] = [
  ['short', 'Quick read (under 250 pages)', (p) => p < 250], ['mid', '250 – 450 pages', (p) => p >= 250 && p <= 450], ['long', 'Long read (450+ pages)', (p) => p > 450],
]
const chip = (on: boolean) => `shrink-0 h-10 px-4 rounded-full border text-sm font-semibold ${on ? 'bg-ink text-white border-ink' : 'bg-white border-stone-300 text-ink'}`
const sel = 'h-11 rounded-xl border border-stone-300 bg-white px-3 text-[15px]'

export default function Books() {
  const [all, setAll] = useState<Book[] | null>(null)
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [kind, setKind] = useState(''), [genre, setGenre] = useState(''), [len, setLen] = useState(''), [translated, setTranslated] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  useEffect(() => { loadBooks().then(setAll); document.title = 'Book Picks — Q-Locate'; return () => { document.title = 'Q-Locate — Quick location guide' } }, [])

  const ms = useMemo(() => {
    const s = new MiniSearch<Book & { genresText: string }>({ idField: 'slug', fields: ['title', 'author', 'genresText', 'topic', 'pitch', 'language'], storeFields: ['slug'], processTerm,
      searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 4, author: 3, genresText: 2, topic: 2 } } })
    s.addAll((all ?? []).map((b) => ({ ...b, genresText: b.genres.join(' ') })))
    return s
  }, [all])
  const inKind = (b: Book) => !kind || (kind === 'f' ? b.fiction === true : b.fiction === false)
  const genres = useMemo(() => [...new Set((all ?? []).filter(inKind).flatMap((b) => b.genres))].sort(), [all, kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    let xs = all ?? []
    if (q.trim().length >= 2) { const ids = ms.search(expand(q)).map((r) => r.id as string); const rank = new Map(ids.map((s, i) => [s, i])); xs = xs.filter((b) => rank.has(b.slug)).sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!) }
    const lf = LENGTHS.find((l) => l[0] === len)?.[2]
    return xs.filter((b) => inKind(b) && (!genre || b.genres.includes(genre)) && (!lf || (b.pages != null && lf(b.pages)))
      && (!translated || (translated === 'orig' ? !/translated/i.test(b.language ?? '') : /translated/i.test(b.language ?? ''))))
  }, [all, ms, q, kind, genre, len, translated]) // eslint-disable-line react-hooks/exhaustive-deps
  const filtersOn = !!(kind || genre || len || translated || q)

  const surprise = () => {
    if (!shown.length) return
    const b = shown[Math.floor(Math.random() * shown.length)]
    setPick(b.slug)
    setTimeout(() => document.getElementById(`b-${b.slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  return (
    <main className="flex flex-col gap-4 pt-5">
      <header className="px-5 flex items-center gap-3">
        <Link to="/" aria-label="Back to home" className="w-11 h-11 -ml-2 grid place-items-center rounded-full text-ink no-underline text-2xl">‹</Link>
        <div>
          <h1 className="m-0 font-display text-3xl font-bold tracking-tight">Book Picks</h1>
          <p className="m-0 text-sm text-muted">Books reviewers loved — find your next read</p>
          <p className="m-0 mt-1 text-xs font-semibold text-forest">English only: written in English, or English translations</p>
        </div>
      </header>

      <PicksSwitch />

      <div className="px-5 flex gap-2">
        <label className="flex-1 min-w-0 flex items-center gap-2 h-12 px-4 bg-white border border-stone-300 rounded-2xl">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6B5E" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
          <input type="search" aria-label="Search books" placeholder="Title, author or topic" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-0 bg-transparent outline-none text-base" />
        </label>
        <button onClick={surprise} disabled={!shown.length} className="h-12 px-3 rounded-2xl bg-saffron text-maroon font-bold whitespace-nowrap text-sm disabled:opacity-50">Pick for me</button>
      </div>

      <div className="flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Fiction or non-fiction">
        {[['', 'All'], ['f', 'Fiction'], ['n', 'Non-fiction']].map(([k, l]) => <button key={k} className={chip(kind === k)} onClick={() => { setKind(k); setGenre('') }}>{l}</button>)}
      </div>
      {genres.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Category">
          {genres.map((g) => <button key={g} className={chip(genre === g)} onClick={() => setGenre(genre === g ? '' : g)}>{g}</button>)}
        </div>
      )}
      <div className="px-5 grid grid-cols-2 gap-2">
        <select aria-label="Length" className={sel} value={len} onChange={(e) => setLen(e.target.value)}><option value="">Any length</option>{LENGTHS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Original or translated" className={sel} value={translated} onChange={(e) => setTranslated(e.target.value)}><option value="">Original or translated</option><option value="orig">Written in English</option><option value="tr">English translations</option></select>
      </div>

      <p className="m-0 px-5 text-sm text-muted" role="status">{all === null ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'book' : 'books'}`}
        {filtersOn && <button className="ml-3 underline" onClick={() => { setQ(''); setKind(''); setGenre(''); setLen(''); setTranslated('') }}>Clear</button>}</p>

      {all !== null && shown.length === 0 && (
        <div className="mx-5 p-5 rounded-2xl bg-white text-center"><p className="m-0 font-semibold">{all.length ? 'Nothing matches.' : 'Book Picks are coming soon.'}</p>
          {all.length > 0 && <p className="m-0 mt-1 text-sm text-muted">Try fewer filters.</p>}</div>
      )}

      <ul className="list-none m-0 px-5 flex flex-col gap-3">
        {shown.map((b) => (
          <li key={b.slug} id={`b-${b.slug}`} className={`p-4 rounded-2xl bg-white flex flex-col gap-2 ${pick === b.slug ? 'ring-4 ring-saffron' : ''}`}>
            {pick === b.slug && <span className="self-start text-[11px] font-bold uppercase tracking-wider text-maroon">Your next read</span>}
            <div>
              <h2 className="m-0 font-serif text-xl font-bold leading-snug">{b.title}</h2>
              <div className="text-sm text-muted">{[b.author, b.year, b.pages ? `about ${b.pages} pages` : '', b.language && b.language !== 'English' ? b.language : ''].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {b.fiction != null && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-ink/10">{b.fiction ? 'Fiction' : 'Non-fiction'}</span>}
              {b.genres.map((g) => <span key={g} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sand">{g}</span>)}
              {b.topic && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-forest/10 text-forest">{b.topic}</span>}
            </div>
            {b.pitch && <p className="m-0 text-[16px] leading-relaxed">{b.pitch}</p>}
            {b.recs.length > 0 && (
              <div className="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted">Recommended by</span>
                {b.recs.map((r, i) => r.url
                  ? <a key={i} href={r.url} target="_blank" rel="noreferrer" className="font-semibold">{r.handle ?? 'reviewer'} <span aria-hidden="true">▶</span><span className="sr-only">watch reel</span></a>
                  : <b key={i}>{r.handle}</b>)}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 px-5 py-6 text-xs text-muted leading-relaxed">Picks come from reviewers' public reels, credited above; Q-Locate isn't affiliated with them, the authors or publishers. Details are drafted with help from Wikidata and AI and checked by Q-Locate.</p>
    </main>
  )
}
