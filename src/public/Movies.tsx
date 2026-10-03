import { useEffect, useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import { Link } from 'react-router-dom'
import { loadMovies, runtime, type Movie } from './data'

const LENGTHS: [string, string, (m: number) => boolean][] = [
  ['short', 'Under 1h 45m', (m) => m < 105], ['mid', '1h 45m – 2h 15m', (m) => m >= 105 && m <= 135], ['long', 'Over 2h 15m', (m) => m > 135],
]
const chip = (on: boolean) => `shrink-0 h-10 px-4 rounded-full border text-sm font-semibold ${on ? 'bg-ink text-white border-ink' : 'bg-white border-stone-300 text-ink'}`
const sel = 'h-11 rounded-xl border border-stone-300 bg-white px-3 text-[15px]'

export default function Movies() {
  const [all, setAll] = useState<Movie[] | null>(null)
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState(''), [topic, setTopic] = useState(''), [lang, setLang] = useState(''), [country, setCountry] = useState('')
  const [len, setLen] = useState(''), [family, setFamily] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  useEffect(() => { loadMovies().then(setAll); document.title = 'Movie Picks — Q-Locate'; return () => { document.title = 'Q-Locate — Quick location guide' } }, [])

  const ms = useMemo(() => {
    const s = new MiniSearch<Movie>({ idField: 'slug', fields: ['title', 'country', 'language', 'genresText', 'doc_topic', 'pitch'], storeFields: ['slug'],
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 4, genresText: 2, doc_topic: 2, country: 2 } } })
    s.addAll((all ?? []).map((m) => ({ ...m, genresText: m.genres.join(' ') })))
    return s
  }, [all])
  const genres = useMemo(() => [...new Set((all ?? []).flatMap((m) => m.genres))].sort(), [all])
  const topics = useMemo(() => [...new Set((all ?? []).map((m) => m.doc_topic).filter(Boolean) as string[])].sort(), [all])
  const countries = useMemo(() => [...new Set((all ?? []).flatMap((m) => (m.country ?? '').split(',').map((c) => c.trim())).filter(Boolean))].sort(), [all])

  const shown = useMemo(() => {
    let xs = all ?? []
    if (q.trim().length >= 2) { const ids = ms.search(q).map((r) => r.id as string); const rank = new Map(ids.map((s, i) => [s, i])); xs = xs.filter((m) => rank.has(m.slug)).sort((a, b) => rank.get(a.slug)! - rank.get(b.slug)!) }
    const lf = LENGTHS.find((l) => l[0] === len)?.[2]
    return xs.filter((m) => (!genre || m.genres.includes(genre)) && (!topic || m.doc_topic === topic)
      && (!lang || (lang === 'en' ? !m.subtitles : !!m.subtitles)) && (!country || (m.country ?? '').includes(country))
      && (!lf || (m.runtime_min != null && lf(m.runtime_min))) && (!family || m.family_friendly === true))
  }, [all, ms, q, genre, topic, lang, country, len, family])
  const filtersOn = !!(genre || topic || lang || country || len || family || q)

  const surprise = () => {
    if (!shown.length) return
    const m = shown[Math.floor(Math.random() * shown.length)]
    setPick(m.slug)
    setTimeout(() => document.getElementById(`m-${m.slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  return (
    <main className="flex flex-col gap-4 pt-5">
      <header className="px-5 flex items-center gap-3">
        <Link to="/" aria-label="Back to home" className="w-11 h-11 -ml-2 grid place-items-center rounded-full text-ink no-underline text-2xl">‹</Link>
        <div>
          <h1 className="m-0 font-display text-3xl font-bold tracking-tight">Movie Picks</h1>
          <p className="m-0 text-sm text-muted">English movies reviewers loved — pick one for the weekend</p>
          <p className="m-0 mt-1 text-xs font-semibold text-forest">English only: films in English, or world cinema with English subtitles</p>
        </div>
      </header>

      <div className="px-5 flex gap-2">
        <label className="flex-1 flex items-center gap-2 h-12 px-4 bg-white border border-stone-300 rounded-2xl">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6B5E" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></svg>
          <input type="search" aria-label="Search movies" placeholder="Title, country or mood" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent outline-none text-base" />
        </label>
        <button onClick={surprise} disabled={!shown.length} className="h-12 px-3 rounded-2xl bg-saffron text-maroon font-bold whitespace-nowrap text-sm disabled:opacity-50">Pick for me</button>
      </div>

      {genres.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Category">
          <button className={chip(!genre)} onClick={() => { setGenre(''); setTopic('') }}>All</button>
          {genres.map((g) => <button key={g} className={chip(genre === g)} onClick={() => { setGenre(genre === g ? '' : g); setTopic('') }}>{g}</button>)}
        </div>
      )}
      {genre === 'Documentary' && topics.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Documentary topic">
          {topics.map((t) => <button key={t} className={chip(topic === t)} onClick={() => setTopic(topic === t ? '' : t)}>{t}</button>)}
        </div>
      )}

      <div className="px-5 grid grid-cols-2 gap-2">
        <select aria-label="Language" className={sel} value={lang} onChange={(e) => setLang(e.target.value)}><option value="">Any language</option><option value="en">In English</option><option value="subs">With English subtitles</option></select>
        <select aria-label="Country" className={sel} value={country} onChange={(e) => setCountry(e.target.value)}><option value="">Any country</option>{countries.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Length" className={sel} value={len} onChange={(e) => setLen(e.target.value)}><option value="">Any length</option>{LENGTHS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="h-11 flex items-center gap-2 px-3 rounded-xl border border-stone-300 bg-white text-[15px]"><input type="checkbox" className="w-5 h-5" checked={family} onChange={(e) => setFamily(e.target.checked)} />Family friendly</label>
      </div>

      <p className="m-0 px-5 text-sm text-muted" role="status">{all === null ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'movie' : 'movies'}`}
        {filtersOn && <button className="ml-3 underline" onClick={() => { setQ(''); setGenre(''); setTopic(''); setLang(''); setCountry(''); setLen(''); setFamily(false) }}>Clear</button>}</p>

      {all !== null && shown.length === 0 && (
        <div className="mx-5 p-5 rounded-2xl bg-white text-center"><p className="m-0 font-semibold">{all.length ? 'Nothing matches.' : 'Movie Picks are coming soon.'}</p>
          {all.length > 0 && <p className="m-0 mt-1 text-sm text-muted">Try fewer filters.</p>}</div>
      )}

      <ul className="list-none m-0 px-5 flex flex-col gap-3">
        {shown.map((m) => (
          <li key={m.slug} id={`m-${m.slug}`} className={`p-4 rounded-2xl bg-white flex flex-col gap-2 transition-shadow ${pick === m.slug ? 'ring-4 ring-saffron' : ''}`}>
            {pick === m.slug && <span className="self-start text-[11px] font-bold uppercase tracking-wider text-maroon">Tonight's pick</span>}
            <div>
              <h2 className="m-0 font-display text-xl font-bold leading-snug">{m.title}{m.year ? <span className="font-normal text-muted"> ({m.year})</span> : null}</h2>
              <div className="text-sm text-muted">{[m.country, m.language && (m.subtitles ? `${m.language} · ${m.subtitles}` : m.language), runtime(m.runtime_min)].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {m.genres.map((g) => <span key={g} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sand">{g}</span>)}
              {m.doc_topic && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-forest/10 text-forest">{m.doc_topic}</span>}
              {m.family_friendly && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-900">Family friendly</span>}
            </div>
            {m.pitch && <p className="m-0 text-[16px] leading-relaxed">{m.pitch}</p>}
            {m.recs.length > 0 && (
              <div className="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted">Recommended by</span>
                {m.recs.map((r, i) => r.url
                  ? <a key={i} href={r.url} target="_blank" rel="noreferrer" className="font-semibold">{r.handle ?? 'reviewer'} <span aria-hidden="true">▶</span><span className="sr-only">watch reel</span></a>
                  : <b key={i}>{r.handle}</b>)}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 px-5 py-6 text-xs text-muted leading-relaxed">Picks come from reviewers' public reels, credited above; Q-Locate isn't affiliated with them or the films. Details are drafted with help from Wikidata and AI and checked by Q-Locate. Check the age rating and where it's streaming before you watch.</p>
    </main>
  )
}
