import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Me, STATUS_CLASS, STATUS_LABEL } from './api'

interface Row { id: number; kind: string; name: string; state: string | null; district_city: string | null; status: string; verified_on: string | null; updated_at: string; cover_photo: string | null }

export default function PlacesList({ me }: { me: Me }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [kind, setKind] = useState(me.scope === 'all' ? '' : me.scope)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ kind, status, q })
      api<{ places: Row[] }>(`/places?${p}`).then((d) => setRows(d.places)).catch(() => setRows([]))
    }, 200)
    return () => clearTimeout(t)
  }, [kind, status, q])

  const sel = 'h-11 rounded-lg border border-stone-300 bg-white px-3'
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 mr-auto font-display text-2xl font-bold">Places</h1>
        <Link to="/admin/places/new" className="h-11 px-4 rounded-lg bg-forest text-white font-semibold no-underline flex items-center">+ Add place</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" className={`${sel} flex-1 min-w-48`} placeholder="Search name or state" value={q} onChange={(e) => setQ(e.target.value)} />
        {me.scope === 'all' && (
          <select aria-label="Kind" className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Explore + Darshan</option><option value="vacation">Explore (vacation)</option><option value="spiritual">Darshan (spiritual)</option>
          </select>
        )}
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="draft">Draft</option><option value="review">In review</option>
          <option value="published">Published</option><option value="archived">Archived</option><option value="stale">Stale (not verified 12 months)</option>
        </select>
      </div>
      {!rows ? <p>Loading…</p> : rows.length === 0 ? <p className="text-muted">No places match.</p> : (
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-stone-200 border border-stone-200 rounded-xl">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/admin/places/${r.id}`} className="flex items-center gap-3 p-3 no-underline text-ink hover:bg-stone-50">
                {r.cover_photo
                  ? <img src={`/img/${r.cover_photo}-400.webp`} alt="" className="w-14 h-14 rounded-lg object-cover" />
                  : <div className="w-14 h-14 rounded-lg bg-stone-200" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.name}</div>
                  <div className="text-sm text-muted truncate">{r.kind === 'vacation' ? 'Explore' : 'Darshan'} · {[r.district_city, r.state].filter(Boolean).join(', ') || '—'}</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
