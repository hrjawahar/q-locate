import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useOnline } from './useSemantic'

const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const tabs = [
  { to: '/', label: 'Home', d: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', end: true },
  { to: '/movies', label: 'Picks', d: 'M4 5h16v14H4zM4 9h16M8 5l2 4M13 5l2 4M10 12.5v4l3.5-2z', also: '/books' },
  { to: '/saved', label: 'Saved', d: 'M6 3h12v18l-6-4-6 4z' },
  { to: '/community', label: 'Community', d: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11.5a2.5 2.5 0 1 0 0-5M16 14.2c3.1.2 5.5 2.4 5.5 5.8' },
  { to: '/about', label: 'About', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5h.01' },
]

export default function Layout() {
  const { pathname } = useLocation()
  const online = useOnline()
  return (
    <div className="min-h-full flex flex-col bg-sand">
      {!online && (
        <div role="status" className="no-print sticky top-0 z-30 px-4 py-2 bg-ink text-white text-sm text-center">
          You’re offline. Saved places still open; smart search and the latest updates return when you reconnect.
        </div>
      )}
      <div className="flex-1 w-full max-w-2xl mx-auto pb-24"><Outlet /></div>
      <nav aria-label="Main" className="no-print fixed bottom-0 inset-x-0 z-20 bg-white border-t border-stone-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto flex justify-around">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 min-w-14 h-16 text-xs font-semibold no-underline ${isActive || ('also' in t && pathname.startsWith(t.also as string)) ? 'text-forest' : 'text-muted'}`}>
              <Icon d={t.d} />{t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="px-5 py-6 text-xs text-muted leading-relaxed">
      Information is for reference; confirm timings, prices and availability before you travel. Data from Wikidata, GeoNames and © OpenStreetMap contributors; photos via Wikimedia Commons where credited; some text drafted with AI and checked by Q-Locate. Works best when you’re connected to the internet. <a href="/about" className="text-muted">About &amp; credits</a>
    </footer>
  )
}
