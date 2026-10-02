import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, Me, STATUS_CLASS, STATUS_LABEL } from './api'

interface Row { id: number; kind: string; name: string; country: string | null; state: string | null; district_city: string | null; status: string; verified_on: string | null; updated_at: string; cover_photo: string | null; needs_review: number | null; ai_pending: string | null }

export default function PlacesList({ me }: { me: Me }) {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [kind, setKind] = useState(me.scope === 'all' ? '' : me.scope)
  const status = params.get('status') ?? ''
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ kind, status, q })
      api<{ places: Row[] }>(`/places?${p}`).then((d) => { setRows(d.places); setSel(new Set()) }).catch(() => setRows([]))
    }, 200)
    return () => clearTimeout(t)
  }, [kind, status, q, tick])

  const bulk = async (s: 'published' | 'archived') => {
    setMsg('Working…')
    const d = await api<{ results: { id: number; ok: boolean; error?: string }[] }>('/places/bulk', { method: 'POST', json: { ids: [...sel], status: s } })
    const bad = d.results.filter((r) => !r.ok)
    const names = (id: number) => rows?.find((r) => r.id === id)?.name ?? `#${id}`
    setMsg(`${d.results.length - bad.length} ${s === 'published' ? 'published' : 'archived'}.${bad.length ? ` ${bad.length} not done: ${bad.slice(0, 4).map((b) => `${names(b.id)} (${b.error})`).join('; ')}${bad.length > 4 ? '…' : ''}` : ''}`)
    setTick((t) => t + 1)
  }

  const selCls = 'h-11 rounded-lg border border-stone-300 bg-white px-3'
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 mr-auto font-display text-2xl font-bold">Places</h1>
        {me.role !== 'editor' && <Link to="/admin/import" className="h-11 px-4 rounded-lg border border-forest text-forest font-semibold no-underline flex items-center">Import</Link>}
        <Link to="/admin/places/new" className="h-11 px-4 rounded-lg bg-forest text-white font-semibold no-underline flex items-center">+ Add place</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" className={`${selCls} flex-1 min-w-48`} placeholder="Search name or state" value={q} onChange={(e) => setQ(e.target.value)} />
        {me.scope === 'all' && (
          <select aria-label="Kind" className={selCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Explore + Darshan</option><option value="vacation">Explore (vacation)</option><option value="spiritual">Darshan (spiritual)</option>
          </select>
        )}
        <select aria-label="Status" className={selCls} value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
          <option value="">All statuses</option><option value="imported">Imported — needs review</option><option value="draft">Draft</option><option value="review">In review</option>
          <option value="published">Published</option><option value="archived">Archived</option><option value="stale">Stale (not verified 12 months)</option>
        </select>
      </div>
      {me.role !== 'editor' && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-stone-100 text-sm">
          <b>{sel.size} selected</b>
          <button className="h-10 px-3 rounded-lg bg-saffron text-maroon font-semibold" onClick={() => bulk('published')}>Publish</button>
          <button className="h-10 px-3 rounded-lg border border-stone-300 bg-white font-semibold" onClick={() => bulk('archived')}>Archive</button>
          <button className="h-10 px-3 rounded-lg border border-stone-300 bg-white font-semibold" onClick={async () => {
            const s = await api<{ counts: Record<string, number> }>('/import/refill', { method: 'POST', json: { ids: [...sel] } })
            setMsg(`Queued to refill empty fields from open sources (only places linked to Wikidata). ${s.counts.pending} waiting — see the Import page.`)
          }}>Refill from sources</button>
          <button className="h-10 px-3 rounded-lg border border-stone-300 bg-white font-semibold" onClick={async () => {
            if (!confirm('Rewrite the summary, highlights, how to reach and practical details with AI web research?\n\nThis replaces the current text. Published places go back to "In review" until you check them.')) return
            const s = await api<{ counts: Record<string, number> }>('/import/refill', { method: 'POST', json: { ids: [...sel], rewrite: true } })
            setMsg(`Queued for AI rewrite. ${s.counts.pending} waiting — see the Import page.`)
          }}>Rewrite with AI</button>
          <span className="text-muted">Only places with every required field and checked AI drafts will publish.</span>
        </div>
      )}
      {msg && <p className="m-0 text-sm" role="status">{msg}</p>}
      {!rows ? <p>Loading…</p> : rows.length === 0 ? <p className="text-muted">No places match.</p> : (
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-stone-200 border border-stone-200 rounded-xl">
          {me.role !== 'editor' && (
            <li className="flex items-center gap-3 px-3 py-2 text-sm bg-stone-50 rounded-t-xl">
              <input type="checkbox" className="w-5 h-5" aria-label="Select all" checked={sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
              <span>Select all ({rows.length})</span>
            </li>
          )}
          {rows.map((r) => {
            const ai = (() => { try { return (JSON.parse(r.ai_pending || '[]') as string[]).length } catch { return 0 } })()
            return (
              <li key={r.id} className="flex items-center gap-3 p-3">
                {me.role !== 'editor' && <input type="checkbox" className="w-5 h-5" aria-label={`Select ${r.name}`} checked={sel.has(r.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSel(s) }} />}
                <Link to={`/admin/places/${r.id}`} className="flex flex-1 min-w-0 items-center gap-3 no-underline text-ink">
                  {r.cover_photo ? <img src={`/img/${r.cover_photo}-400.webp`} alt="" className="w-14 h-14 rounded-lg object-cover" /> : <div className="w-14 h-14 rounded-lg bg-stone-200" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{r.name}</div>
                    <div className="text-sm text-muted truncate">{r.kind === 'vacation' ? 'Explore' : 'Darshan'} · {r.country && r.country !== 'India' ? `${r.country} · ` : ''}{[r.district_city, r.state].filter(Boolean).join(', ') || '—'}</div>
                  </div>
                  {ai > 0 && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900">{ai} AI to check</span>}
                  {r.needs_review ? <span className="text-xs font-semibold px-2 py-1 rounded-full bg-sky-100 text-sky-900">Imported</span> : null}
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
