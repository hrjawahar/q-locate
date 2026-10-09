import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Me } from './api'

const CATEGORIES = ['Handloom & textiles', 'Handicrafts', 'Pottery & terracotta', 'Farm produce', 'Spices, tea & coffee', 'Honey & organic', 'Food & pickles', 'Other']
const inp = 'h-11 w-full rounded-lg border border-stone-300 px-3 bg-white font-normal'
const btn = 'h-11 px-4 rounded-lg font-semibold border border-stone-300 bg-white disabled:opacity-50'
const ST: Record<string, [string, string]> = { draft: ['Draft', 'bg-stone-100'], published: ['Published', 'bg-green-100 text-green-900'], archived: ['Archived', 'bg-stone-200 text-stone-500'] }

interface Maker { name: string; products: string | null; category: string | null; village: string | null; district: string | null; state: string | null; country: string | null; phone: string | null; about: string | null; consent: boolean; status?: string }
interface Row { id: number; name: string; products: string | null; category: string | null; village: string | null; district: string | null; state: string | null; status: string; consent: number }
const EMPTY: Maker = { name: '', products: '', category: '', village: '', district: '', state: '', country: 'India', phone: '', about: '', consent: false }

export function MakersList({ me }: { me: Me }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState(''), [status, setStatus] = useState('')
  useEffect(() => {
    const t = setTimeout(() => api<{ makers: Row[] }>(`/makers?${new URLSearchParams({ q, status })}`).then((d) => setRows(d.makers)).catch(() => setRows([])), 250)
    return () => clearTimeout(t)
  }, [q, status])
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-display text-2xl font-bold flex-1">Vocal for Local</h1>
        <Link to="/admin/makers/new" className="h-11 px-4 grid place-items-center rounded-lg font-semibold bg-forest text-white no-underline">+ Add maker</Link>
      </div>
      <p className="m-0 text-sm text-muted">Farmers, weavers and artisans: product, village, category and contact number. Information only — users contact the maker directly.</p>
      <div className="flex flex-wrap gap-2">
        <input className={`${inp} flex-1 min-w-48`} placeholder="Search name, product, village, district, state" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inp} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="draft">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select>
      </div>
      {!rows ? <p>Loading…</p> : rows.length === 0 ? <p className="text-muted">No makers yet.</p> : (
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-stone-200 border border-stone-200 rounded-xl">
          {rows.map((r) => (
            <li key={r.id}><Link to={`/admin/makers/${r.id}`} className="flex flex-wrap items-center gap-3 p-3 no-underline text-ink">
              <div className="flex-1 min-w-48"><div className="font-semibold">{r.name}</div>
                <div className="text-sm text-muted">{[r.category, r.products, [r.village, r.district, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div></div>
              {!r.consent && <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-900">Consent not ticked</span>}
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ST[r.status]?.[1]}`}>{ST[r.status]?.[0] ?? r.status}</span>
            </Link></li>
          ))}
        </ul>
      )}
      {me.role === 'editor' && <p className="m-0 text-sm text-muted">Editors can add and edit drafts; a publisher or owner publishes.</p>}
    </section>
  )
}

export function MakerForm({ me }: { me: Me }) {
  const { id } = useParams()
  const isNew = id === 'new'
  const nav = useNavigate()
  const [m, setM] = useState<Maker | null>(isNew ? EMPTY : null)
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!isNew) api<{ maker: Maker }>(`/makers/${id}`).then((d) => setM(d.maker)).catch((e) => setMsg({ text: e.message })) }, [id, isNew])
  if (!m) return <p>{msg?.text ?? 'Loading…'}</p>
  const set = (k: keyof Maker, v: unknown) => setM({ ...m, [k]: v })
  const canPub = me.role !== 'editor'

  const save = async (): Promise<number | null> => {
    setBusy(true); setMsg(null)
    try {
      if (isNew) { const r = await api<{ id: number }>('/makers', { method: 'POST', json: { maker: m } }); nav(`/admin/makers/${r.id}`, { replace: true }); setMsg({ text: 'Saved', ok: true }); return r.id }
      await api(`/makers/${id}`, { method: 'PUT', json: { maker: m } }); setMsg({ text: 'Saved', ok: true }); return Number(id)
    } catch (e) { setMsg({ text: (e as Error).message }); return null } finally { setBusy(false) }
  }
  const status = async (s: string) => {
    const mid = await save(); if (!mid) return
    setBusy(true)
    try { await api(`/makers/${mid}/status`, { method: 'POST', json: { status: s } }); setM({ ...m, status: s }); setMsg({ text: s === 'published' ? 'Published — it’s live in Vocal for Local' : 'Updated', ok: true }) }
    catch (e) { setMsg({ text: (e as Error).message }) }
    setBusy(false)
  }
  const del = async () => { if (!confirm('Delete this maker?')) return; await api(`/makers/${id}`, { method: 'DELETE' }); nav('/admin/makers') }
  const field = (label: string, el: React.ReactNode, cls = '') => <label className={`flex flex-col gap-1 text-sm font-semibold ${cls}`}>{label}{el}</label>
  const st = m.status ?? 'draft'

  return (
    <section className="flex flex-col gap-5 max-w-3xl">
      <Link to="/admin/makers" className="text-sm">← Vocal for Local</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-display text-2xl font-bold flex-1">{m.name || 'New maker'}</h1>
        {!isNew && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ST[st][1]}`}>{ST[st][0]}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        {field('Maker / business name *', <input className={inp} placeholder="e.g. Lakshmi Handlooms" value={m.name} onChange={(e) => set('name', e.target.value)} />, 'sm:col-span-4')}
        {field('Category *', <select className={inp} value={m.category ?? ''} onChange={(e) => set('category', e.target.value)}><option value="">Choose…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>, 'sm:col-span-2')}
        {field('Products *', <input className={inp} placeholder="e.g. Cotton sarees, silk dhotis" value={m.products ?? ''} onChange={(e) => set('products', e.target.value)} />, 'sm:col-span-6')}
        {field('Village / town *', <input className={inp} value={m.village ?? ''} onChange={(e) => set('village', e.target.value)} />, 'sm:col-span-2')}
        {field('District', <input className={inp} value={m.district ?? ''} onChange={(e) => set('district', e.target.value)} />, 'sm:col-span-2')}
        {field('State *', <input className={inp} value={m.state ?? ''} onChange={(e) => set('state', e.target.value)} />, 'sm:col-span-2')}
        {field('Country', <input className={inp} value={m.country ?? ''} onChange={(e) => set('country', e.target.value)} />, 'sm:col-span-2')}
        {field('Contact number *', <input className={inp} inputMode="tel" placeholder="+91 …" value={m.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />, 'sm:col-span-2')}
        {field('About (optional, one line)', <input className={inp} maxLength={200} placeholder="e.g. Third-generation weavers; visitors welcome" value={m.about ?? ''} onChange={(e) => set('about', e.target.value)} />, 'sm:col-span-6')}
      </div>
      <label className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 text-sm font-semibold">
        <input type="checkbox" className="w-5 h-5" checked={m.consent} onChange={(e) => set('consent', e.target.checked)} />
        The maker agreed to be listed, including their contact number *
      </label>
      <p className="m-0 text-xs text-muted">The district is used to show this maker on place pages in the same district (“Vocal for Local — nearby”).</p>
      <div className="flex flex-wrap gap-2 items-center py-3 border-t border-stone-200">
        <button className={btn} disabled={busy} onClick={save}>Save</button>
        {canPub && st !== 'published' && <button className="h-11 px-4 rounded-lg font-semibold bg-saffron text-maroon disabled:opacity-50" disabled={busy} onClick={() => status('published')}>Publish</button>}
        {canPub && st === 'published' && <button className={btn} disabled={busy} onClick={() => status('draft')}>Unpublish</button>}
        {canPub && !isNew && <button className={`${btn} ml-auto text-red-700`} disabled={busy} onClick={del}>Delete</button>}
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`} role="status">{msg.text}</span>}
      </div>
    </section>
  )
}
