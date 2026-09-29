import { useEffect, useState } from 'react'
import { api, Me } from './api'

interface U { email: string; name: string | null; role: string; scope: string; active: number; invited_by: string | null }

export default function Users({ me }: { me: Me }) {
  const [users, setUsers] = useState<U[]>([])
  const [form, setForm] = useState({ email: '', name: '', role: 'editor', scope: 'all' })
  const [msg, setMsg] = useState('')
  useEffect(() => { api<{ users: U[] }>('/users').then((d) => setUsers(d.users)) }, [])

  const save = async (u: Partial<U> & { email: string }) => {
    setMsg('')
    try { const d = await api<{ users: U[] }>('/users', { method: 'POST', json: u }); setUsers(d.users); return true }
    catch (e) { setMsg((e as Error).message); return false }
  }
  const inp = 'h-11 rounded-lg border border-stone-300 px-3 bg-white'

  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 font-display text-2xl font-bold">Admins</h1>
      <form className="flex flex-wrap gap-2 items-end p-4 border border-stone-200 rounded-xl"
        onSubmit={async (e) => { e.preventDefault(); if (await save({ ...form, active: 1 })) setForm({ email: '', name: '', role: 'editor', scope: 'all' }) }}>
        <label className="flex flex-col text-sm font-semibold gap-1 flex-1 min-w-52">Email<input required type="email" className={inp} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="flex flex-col text-sm font-semibold gap-1 min-w-40">Name<input className={inp} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="flex flex-col text-sm font-semibold gap-1">Role<select className={inp} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="editor">Editor (drafts only)</option><option value="publisher">Publisher</option><option value="owner">Owner</option></select></label>
        <label className="flex flex-col text-sm font-semibold gap-1">Can edit<select className={inp} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="all">Explore + Darshan</option><option value="vacation">Explore only</option><option value="spiritual">Darshan only</option></select></label>
        <button className="h-11 px-4 rounded-lg bg-forest text-white font-semibold">Invite</button>
      </form>
      {msg && <p className="m-0 text-red-700">{msg}</p>}
      <p className="m-0 text-sm text-muted">Invited people open the admin address and sign in with a PIN sent to their email.</p>
      <ul className="list-none m-0 p-0 divide-y divide-stone-200 border border-stone-200 rounded-xl">
        {users.map((u) => (
          <li key={u.email} className="flex flex-wrap items-center gap-2 p-3">
            <div className="flex-1 min-w-52"><div className="font-semibold">{u.name || u.email}</div><div className="text-sm text-muted">{u.email}</div></div>
            <select aria-label={`Role for ${u.email}`} className={inp} value={u.role} disabled={u.email === me.email} onChange={(e) => save({ ...u, role: e.target.value })}>
              <option value="editor">Editor</option><option value="publisher">Publisher</option><option value="owner">Owner</option></select>
            <select aria-label={`Scope for ${u.email}`} className={inp} value={u.scope} disabled={u.email === me.email} onChange={(e) => save({ ...u, scope: e.target.value })}>
              <option value="all">Both tabs</option><option value="vacation">Explore</option><option value="spiritual">Darshan</option></select>
            <button disabled={u.email === me.email} onClick={() => save({ ...u, active: u.active ? 0 : 1 })}
              className="h-11 px-3 rounded-lg border border-stone-300 bg-white font-semibold disabled:opacity-40">{u.active ? 'Deactivate' : 'Reactivate'}</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
