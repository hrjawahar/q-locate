import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { api, ApiError, Me, Lookups } from './api'
import { LogoMark } from '../components/Logo'
import PlacesList from './PlacesList'
import PlaceForm from './PlaceForm'
import Users from './Users'
import Activity from './Activity'
import Import from './Import'
import Tracker from './Tracker'
import { MoviesList, MovieForm } from './Movies'
import { BooksList, BookForm } from './Books'
import { FestivalsList, FestivalForm } from './Festivals'
import { MakersList, MakerForm } from './Makers'

export default function AdminApp() {
  const [me, setMe] = useState<Me | null>(null)
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [error, setError] = useState<{ msg: string; email?: string; detail?: string } | null>(null)

  useEffect(() => {
    api<Me>('/me')
      .then(async (m) => { setMe(m); setLookups(await api<Lookups>('/lookups')) })
      .catch((e: ApiError) => setError({
        msg: e.data.error === 'not_admin' ? 'This email is not an admin yet. Ask the owner to invite you.'
          : e.data.error === 'not_signed_in' ? 'You are not signed in. Open this page through the Q-Locate admin address.'
          : e.message,
        email: e.data.email as string | undefined,
        detail: e.data.detail as string | undefined,
      }))
  }, [])

  if (error) return (
    <main className="min-h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
      <LogoMark size={56} />
      <h1 className="font-display text-xl font-bold m-0">Q-Locate Admin</h1>
      <p className="m-0 max-w-sm">{error.msg}</p>
      {error.email && <p className="m-0 text-sm text-muted">Signed in as {error.email}</p>}
      {error.detail && <p className="m-0 text-xs text-muted">Reason: {error.detail}</p>}
    </main>
  )
  if (!me || !lookups) return <p className="p-6">Loading…</p>

  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg no-underline ${isActive ? 'bg-forest text-white' : 'text-ink hover:bg-stone-200'}`

  return (
    <div className="min-h-full bg-white">
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-2 px-4 py-3">
          <LogoMark size={30} bg="#FFFFFF" />
          <span className="font-display font-bold mr-4">Q-Locate Admin</span>
          <nav className="flex flex-wrap gap-1 text-sm font-semibold">
            <NavLink to="/admin" end className={link}>Places</NavLink>
            {me.role !== 'editor' && <NavLink to="/admin/import" className={link}>Import</NavLink>}
            {me.role !== 'editor' && (me.scope === 'all' || me.scope === 'spiritual') && <NavLink to="/admin/tracker" className={link}>Temple tracker</NavLink>}
            {me.scope === 'all' && <NavLink to="/admin/movies" className={link}>Movie Picks</NavLink>}
            {me.scope === 'all' && <NavLink to="/admin/festivals" className={link}>Festivals</NavLink>}
            {me.scope === 'all' && <NavLink to="/admin/makers" className={link}>Vocal for Local</NavLink>}
            {me.scope === 'all' && <NavLink to="/admin/books" className={link}>Book Picks</NavLink>}
            {me.role !== 'editor' && <NavLink to="/admin/activity" className={link}>Activity</NavLink>}
            {me.role === 'owner' && <NavLink to="/admin/users" className={link}>Admins</NavLink>}
          </nav>
          <span className="ml-auto text-xs text-muted">{me.email} · {me.role}{me.scope !== 'all' ? ` (${me.scope})` : ''}</span>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-5">
        <Routes>
          <Route index element={<PlacesList me={me} />} />
          <Route path="places/new" element={<PlaceForm me={me} lookups={lookups} />} />
          <Route path="places/:id" element={<PlaceForm me={me} lookups={lookups} />} />
          {me.role !== 'editor' && <Route path="activity" element={<Activity />} />}
          {me.role !== 'editor' && <Route path="import" element={<Import me={me} />} />}
          {me.role !== 'editor' && <Route path="tracker" element={<Tracker />} />}
          {me.scope === 'all' && <Route path="movies" element={<MoviesList me={me} />} />}
          {me.scope === 'all' && <Route path="movies/:id" element={<MovieForm me={me} />} />}
          {me.scope === 'all' && <Route path="books" element={<BooksList me={me} />} />}
          {me.scope === 'all' && <Route path="books/:id" element={<BookForm me={me} />} />}
          {me.scope === 'all' && <Route path="festivals" element={<FestivalsList me={me} />} />}
          {me.scope === 'all' && <Route path="festivals/:id" element={<FestivalForm me={me} />} />}
          {me.scope === 'all' && <Route path="makers" element={<MakersList me={me} />} />}
          {me.scope === 'all' && <Route path="makers/:id" element={<MakerForm me={me} />} />}
          {me.role === 'owner' && <Route path="users" element={<Users me={me} />} />}
        </Routes>
      </div>
    </div>
  )
}
