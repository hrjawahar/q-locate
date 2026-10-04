import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from './Layout'
import { CONFIG } from './config'
import { savedPlaces, placeUrl, where, type Place } from './data'

export function Saved() {
  const [list, setList] = useState<Place[] | null>(null)
  useEffect(() => { savedPlaces().then(setList) }, [])
  return (
    <main className="px-5 pt-7 flex flex-col gap-4">
      <h1 className="m-0 font-display text-3xl font-bold tracking-tight">Saved</h1>
      <p className="m-0 text-muted">Saved places open even without internet.</p>
      {list === null ? <p>Loading…</p> : list.length === 0 ? (
        <div className="p-5 rounded-2xl bg-white"><p className="m-0 font-semibold">Nothing saved yet.</p><p className="m-0 mt-1 text-sm text-muted">Tap Save on any place to keep it here.</p></div>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.slug}><Link to={placeUrl(p as never)} className="flex items-center gap-3 p-3 bg-white rounded-2xl no-underline text-ink">
              <div className="w-16 h-16 shrink-0 rounded-xl bg-stone-200 overflow-hidden">{p.cover?.thumb && <img src={p.cover.thumb} alt="" className="w-full h-full object-cover" />}</div>
              <div className="min-w-0"><div className="font-semibold">{p.name}</div><div className="text-sm text-muted truncate">{p.kind === 'spiritual' ? 'Darshan' : 'Explore'} · {where(p)}</div></div>
            </Link></li>
          ))}
        </ul>
      )}
    </main>
  )
}

export function Community() {
  return (
    <main className="px-5 pt-7 flex flex-col gap-4">
      <h1 className="m-0 font-display text-3xl font-bold tracking-tight">Community</h1>
      <p className="m-0 text-[17px] leading-relaxed">Soon you'll be able to share tips with other travellers and pilgrims: what changed, the best time to go, where to eat. Every tip will be checked before it appears.</p>
      {CONFIG.whatsappChannel ? (
        <a href={CONFIG.whatsappChannel} target="_blank" rel="noreferrer" className="self-start h-12 px-5 grid place-items-center rounded-2xl bg-forest text-white font-bold no-underline">Follow on WhatsApp</a>
      ) : <p className="m-0 p-4 rounded-2xl bg-white font-semibold">Coming soon.</p>}
      <Footer />
    </main>
  )
}

export function About() {
  return (
    <main className="px-5 pt-7 flex flex-col gap-5 text-[16px] leading-relaxed">
      <h1 className="m-0 font-display text-3xl font-bold tracking-tight">About Q-Locate</h1>
      <p className="m-0">Q-Locate is a quick location guide for travellers, backpackers and pilgrims. Places you've seen in reels, with the basic facts in one place: how to get there, where to stay and eat, what's nearby, and who to call.</p>
      <section><h2 className="m-0 mb-2 font-display text-xl font-semibold">Disclaimer</h2>
        <p className="m-0">Information on Q-Locate is provided in good faith for general reference. Timings, prices, contacts, access and availability change, sometimes without notice. Please confirm directly with the place or official sources before you travel. Q-Locate is not a tour operator, does not take bookings, and is not responsible for any loss, injury or inconvenience from using this information. Stays and eateries are listed, not endorsed; places marked “Partner” have a commercial relationship with Q-Locate. Distances are approximate.</p>
      </section>
      <section><h2 className="m-0 mb-2 font-display text-xl font-semibold">How we check information</h2>
        <p className="m-0">Every place is reviewed by a Q-Locate editor before it is published, and shows the date it was last verified. Some text is first drafted with AI from the sources below; an editor checks it against those sources before publishing.</p>
      </section>
      <section><h2 className="m-0 mb-2 font-display text-xl font-semibold">Credits</h2>
        <ul className="m-0 pl-5 flex flex-col gap-1">
          <li>Place data from <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata</a> (CC0).</li>
          <li>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, available under the Open Database License.</li>
          <li>Place names and regions from <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (CC BY 4.0).</li>
          <li>Photos via <a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons</a>, credited under each photo, or by the creators named.</li>
          <li>Background reading from <a href="https://en.wikipedia.org/" target="_blank" rel="noreferrer">Wikipedia</a>.</li>
          <li>Creators whose reels and posts inspired a place are credited on that place's page.</li>
        </ul>
      </section>
      <section><h2 className="m-0 mb-2 font-display text-xl font-semibold">Best when you’re online</h2>
        <p className="m-0">Q-Locate works best with an internet connection. Online, you get smart search — results that match what you mean, not just the exact words you type — along with the latest timings and updates. Offline, places you’ve saved still open in full and search matches exact words only.</p>
      </section>
      <section><h2 className="m-0 mb-2 font-display text-xl font-semibold">Privacy</h2>
        <p className="m-0">Q-Locate has no accounts. Places you save are stored only on your device. We use privacy-friendly, cookie-free visitor counts.</p>
      </section>
      {CONFIG.reportEmail && <p className="m-0">Found something out of date? Write to <a href={`mailto:${CONFIG.reportEmail}`}>{CONFIG.reportEmail}</a>.</p>}
    </main>
  )
}
