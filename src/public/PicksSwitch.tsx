import { NavLink } from 'react-router-dom'

/** Movies | Books switch shown at the top of both Picks pages. */
export default function PicksSwitch() {
  const cls = ({ isActive }: { isActive: boolean }) => `h-11 grid place-items-center rounded-xl font-semibold no-underline ${isActive ? 'bg-ink text-white' : 'text-muted'}`
  return (
    <nav aria-label="Picks" className="grid grid-cols-2 p-1 mx-5 rounded-2xl bg-white border border-stone-200">
      <NavLink to="/movies" className={cls}>Movies</NavLink>
      <NavLink to="/books" className={cls}>Books</NavLink>
    </nav>
  )
}
