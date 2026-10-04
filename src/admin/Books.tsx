import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Me } from './api'

const FICTION = ['Literary fiction', 'Thriller', 'Mystery', 'Crime', 'Romance', 'Fantasy', 'Sci-fi', 'Historical fiction', 'Humour', 'Classic', 'Short stories', 'Young adult']
const NONFICTION = ['Biography', 'Memoir', 'Self-help', 'Business', 'Finance', 'History', 'Science', 'Psychology', 'Philosophy', 'Spirituality', 'Travel', 'Health', 'Poetry', 'True crime']
const inp = 'h-11 w-full rounded-lg border border-stone-300 px-3 bg-white font-normal'
const btn = 'h-11 px-4 rounded-lg font-semibold border border-stone-300 bg-white disabled:opacity-50'
const hot = 'h-11 px-4 rounded-lg font-semibold bg-forest text-white disabled:opacity-50'
const ST: Record<string, [string, string]> = { draft: ['Draft', 'bg-stone-100'], published: ['Published', 'bg-green-100 text-green-900'], archived: ['Archived', 'bg-stone-200 text-stone-500'] }

interface Rec { handle: string; url: string; note: string }
interface Draft { title: string; author: string | null; year: number | null; language: string | null; fiction: boolean | null; genres: string[]; topic: string | null; pages: number | null; pitch: string | null; wikidata_id: string | null; ai_pending?: string[]; status?: string }
interface Row { id: number; title: string; author: string | null; year: number | null; genres: string; pages: number | null; status: string; ai_pending: string | null; recs: number }

/** Add one book from a reel: title (+ author) + reviewer → Wikidata + AI draft → saved as a draft. */
async function addOne(title: string, author: string, rec: Rec): Promise<{ id: number; existed: boolean }> {
  const r = await api<{ draft?: Draft; duplicate?: { id: number } }>('/books/fill', { method: 'POST', json: { title, author, note: rec.note } })
  if (r.duplicate) {
    if (rec.handle || rec.url) await api(`/books/${r.duplicate.id}/recs`, { method: 'POST', json: rec })
    return { id: r.duplicate.id, existed: true }
  }
  const s = await api<{ id: number }>('/books', { method: 'POST', json: { book: { ...r.draft, ai_pending: ['details'] }, recs: rec.handle || rec.url ? [rec] : [] } })
  return { id: s.id, existed: false }
}

export function BooksList({ me }: { me: Me }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState(''), [status, setStatus] = useState('')
  const [form, setForm] = useState({ title: '', author: '', handle: '', url: '', note: '' })
  const [bulk, setBulk] = useState(''), [showBulk, setShowBulk] = useState(false)
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState('')
  const nav = useNavigate()
  const load = () => api<{ books: Row[] }>(`/books?${new URLSearchParams({ q, status })}`).then((d) => setRows(d.books)).catch(() => setRows([]))
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const quickAdd = async () => {
    if (!form.title.trim()) return
    setBusy('Looking it up and drafting with AI… (up to a minute)'); setMsg('')
    try {
      const r = await addOne(form.title.trim(), form.author.trim(), { handle: form.handle, url: form.url, note: form.note })
      if (r.existed) { setMsg('Already in Book Picks — this reviewer was added to it.'); load() } else nav(`/admin/books/${r.id}`)
      setForm({ title: '', author: '', handle: '', url: '', note: '' })
    } catch (e) { setMsg((e as Error).message) }
    setBusy('')
  }
  const addMany = async () => {
    const lines = bulk.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((l) => l[0])
    let added = 0, existed = 0
    for (let i = 0; i < lines.length; i++) {
      const [t, author = '', handle = '', url = ''] = lines[i]
      setBusy(`Adding ${i + 1} of ${lines.length}: ${t}… keep this page open.`)
      try { const r = await addOne(t, author, { handle, url, note: '' }); if (r.existed) existed++; else added++ } catch { /* keep going */ }
    }
    setBusy(''); setBulk(''); setShowBulk(false); setMsg(`Added ${added} new drafts${existed ? `; ${existed} were already listed (reviewer added)` : ''}.`); load()
  }

  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 font-display text-2xl font-bold">Book Picks</h1>
      <p className="m-0 text-sm text-muted">A short, reviewed list of English books (originals or English translations). Paste the reel you saw; Wikidata and AI fill the details as a draft for you to check. Reviewers are always credited.</p>

      <div className="p-4 rounded-xl border border-stone-200 flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Add from a reel</h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input className={`${inp} sm:col-span-3`} placeholder="Book title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={`${inp} sm:col-span-3`} placeholder="Author (helps find the right book)" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
          <input className={`${inp} sm:col-span-2`} placeholder="Reviewer @handle" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />
          <input className={`${inp} sm:col-span-4`} placeholder="Reel link" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input className={`${inp} sm:col-span-6`} placeholder="What the reviewer liked (optional, helps the AI)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button className={hot} disabled={!!busy || !form.title.trim()} onClick={quickAdd}>Add with AI</button>
          <button className={btn} disabled={!!busy} onClick={() => setShowBulk(!showBulk)}>Add several</button>
          {busy && <span className="text-sm" role="status">{busy}</span>}
        </div>
        {showBulk && (
          <div className="flex flex-col gap-2">
            <label className="text-sm">One per line: <code>Title | Author | @handle | reel link</code> — author, handle and link are optional.
              <textarea className="w-full min-h-32 mt-1 rounded-lg border border-stone-300 p-3 font-mono text-sm" value={bulk} onChange={(e) => setBulk(e.target.value)}
                placeholder={'Atomic Habits | James Clear | @bookreviewer | https://www.instagram.com/reel/...\nThe Alchemist | Paulo Coelho'} /></label>
            <button className={`${hot} self-start`} disabled={!!busy || !bulk.trim()} onClick={addMany}>Add all</button>
          </div>
        )}
        {msg && <p className="m-0 text-sm" role="status">{msg}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <input className={`${inp} flex-1 min-w-48`} placeholder="Search title, author, category" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inp} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="draft">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select>
      </div>
      {!rows ? <p>Loading…</p> : rows.length === 0 ? <p className="text-muted">No books yet.</p> : (
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-stone-200 border border-stone-200 rounded-xl">
          {rows.map((r) => {
            const pending = (JSON.parse(r.ai_pending || '[]') as string[]).length > 0
            return (
              <li key={r.id}><Link to={`/admin/books/${r.id}`} className="flex flex-wrap items-center gap-3 p-3 no-underline text-ink">
                <div className="flex-1 min-w-48"><div className="font-semibold">{r.title}{r.author ? <span className="font-normal"> — {r.author}</span> : null}</div>
                  <div className="text-sm text-muted">{[r.year, (JSON.parse(r.genres || '[]') as string[]).join(', '), r.pages ? `${r.pages} pages` : '', `${r.recs} reviewer${r.recs === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</div></div>
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

export function BookForm({ me }: { me: Me }) {
  const { id } = useParams()
  const nav = useNavigate()
  const [m, setM] = useState<Draft | null>(null)
  const [recs, setRecs] = useState<Rec[]>([])
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api<{ book: Draft; recs: Rec[] }>(`/books/${id}`).then((d) => { setM(d.book); setRecs(d.recs) }).catch((e) => setMsg({ text: e.message })) }, [id])
  if (!m) return <p>{msg?.text ?? 'Loading…'}</p>
  const set = (k: keyof Draft, v: unknown) => setM({ ...m, [k]: v })
  const pending = (m.ai_pending ?? []).length > 0
  const canPub = me.role !== 'editor'
  const save = async () => {
    setBusy(true); setMsg(null)
    try { await api(`/books/${id}`, { method: 'PUT', json: { book: m, recs } }); setMsg({ text: 'Saved', ok: true }) } catch (e) { setMsg({ text: (e as Error).message }) }
    setBusy(false)
  }
  const status = async (s: string) => {
    setBusy(true); setMsg(null)
    try {
      await api(`/books/${id}`, { method: 'PUT', json: { book: m, recs } })
      await api(`/books/${id}/status`, { method: 'POST', json: { status: s } })
      setM({ ...m, status: s }); setMsg({ text: s === 'published' ? 'Published — it’s live in Book Picks' : 'Updated', ok: true })
    } catch (e) { setMsg({ text: (e as Error).message }) }
    setBusy(false)
  }
  const del = async () => { if (!confirm('Delete this book?')) return; await api(`/books/${id}`, { method: 'DELETE' }); nav('/admin/books') }
  const field = (label: string, el: React.ReactNode, cls = '') => <label className={`flex flex-col gap-1 text-sm font-semibold ${cls}`}>{label}{el}</label>
  const cats = m.fiction === false ? NONFICTION : m.fiction === true ? FICTION : [...FICTION, ...NONFICTION]

  return (
    <section className="flex flex-col gap-5 max-w-3xl">
      <Link to="/admin/books" className="text-sm">← Book Picks</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-display text-2xl font-bold flex-1">{m.title || 'Book'}</h1>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ST[m.status ?? 'draft'][1]}`}>{ST[m.status ?? 'draft'][0]}</span>
      </div>
      {pending && (
        <div className="p-3 rounded-lg bg-amber-50 text-amber-900 text-sm flex flex-wrap items-center gap-3">
          <span className="flex-1">AI draft — check the details below{m.wikidata_id ? <> against <a href={`https://www.wikidata.org/wiki/${m.wikidata_id}`} target="_blank" rel="noreferrer">Wikidata ↗</a></> : ''}, then confirm.</span>
          <button className="h-9 px-3 rounded-lg bg-white border border-amber-300 font-semibold" onClick={() => set('ai_pending', [])}>I’ve checked it</button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        {field('Title *', <input className={inp} value={m.title ?? ''} onChange={(e) => set('title', e.target.value)} />, 'sm:col-span-4')}
        {field('First published', <input className={inp} inputMode="numeric" value={m.year ?? ''} onChange={(e) => set('year', e.target.value)} />, 'sm:col-span-2')}
        {field('Author *', <input className={inp} value={m.author ?? ''} onChange={(e) => set('author', e.target.value)} />, 'sm:col-span-3')}
        {field('Language', <input className={inp} placeholder="English, or English (translated from Japanese)" value={m.language ?? ''} onChange={(e) => set('language', e.target.value)} />, 'sm:col-span-3')}
        {field('Fiction or non-fiction', <select className={inp} value={m.fiction == null ? '' : m.fiction ? 'f' : 'n'} onChange={(e) => set('fiction', e.target.value === '' ? null : e.target.value === 'f')}><option value="">Choose…</option><option value="f">Fiction</option><option value="n">Non-fiction</option></select>, 'sm:col-span-2')}
        {field('Pages (approx.)', <input className={inp} inputMode="numeric" value={m.pages ?? ''} onChange={(e) => set('pages', e.target.value)} />, 'sm:col-span-2')}
        {field('Topic (non-fiction)', <input className={inp} placeholder="e.g. Habits, Investing" value={m.topic ?? ''} onChange={(e) => set('topic', e.target.value)} />, 'sm:col-span-2')}
      </div>
      <fieldset className="m-0 p-0 border-0">
        <legend className="text-sm font-semibold mb-2">Category * (pick 1–3)</legend>
        <div className="flex flex-wrap gap-2">
          {cats.map((g) => { const on = m.genres.includes(g); return (
            <button key={g} type="button" aria-pressed={on} onClick={() => set('genres', on ? m.genres.filter((x) => x !== g) : [...m.genres, g].slice(0, 4))}
              className={`h-10 px-3 rounded-full border text-sm font-semibold ${on ? 'bg-forest text-white border-forest' : 'bg-white border-stone-300'}`}>{g}</button>) })}
        </div>
      </fieldset>
      {field('Why read * (one line, no spoilers)', <textarea className="w-full min-h-20 rounded-lg border border-stone-300 p-3 font-normal" maxLength={220} value={m.pitch ?? ''} onChange={(e) => set('pitch', e.target.value)} />)}

      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">Recommended by *</h2>
        {recs.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl bg-stone-50">
            <input className={`${inp} sm:col-span-3`} placeholder="@handle" value={r.handle ?? ''} onChange={(e) => setRecs(recs.map((x, j) => j === i ? { ...x, handle: e.target.value } : x))} />
            <input className={`${inp} sm:col-span-8`} placeholder="Reel link" value={r.url ?? ''} onChange={(e) => setRecs(recs.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
            <button className={`${btn} sm:col-span-1 px-0`} aria-label="Remove" onClick={() => setRecs(recs.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className={`${btn} self-start`} onClick={() => setRecs([...recs, { handle: '', url: '', note: '' }])}>+ Add reviewer</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center py-3 border-t border-stone-200">
        <button className={btn} disabled={busy} onClick={save}>Save</button>
        {canPub && m.status !== 'published' && <button className="h-11 px-4 rounded-lg font-semibold bg-saffron text-maroon disabled:opacity-50" disabled={busy || pending} onClick={() => status('published')}>Publish</button>}
        {canPub && m.status === 'published' && <button className={btn} disabled={busy} onClick={() => status('draft')}>Unpublish</button>}
        {canPub && <button className={`${btn} ml-auto text-red-700`} disabled={busy} onClick={del}>Delete</button>}
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{msg.text}</span>}
      </div>
    </section>
  )
}
