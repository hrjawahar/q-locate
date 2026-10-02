import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { downloadPlacePdf } from './pdf'
import { LogoMark } from '../components/Logo'
import { Footer } from './Layout'
import { CONFIG } from './config'
import { loadPlace, isSaved, savePlace, unsavePlace, openNow, fmtTime, km, where, placeUrl, ACCESS, VISIT, STAY, AMENITY, MONTHS, type Place } from './data'

const H = ({ children, dark }: { children: React.ReactNode; dark: boolean }) =>
  <h2 className={`m-0 mb-3 text-xl font-bold ${dark ? 'font-serif text-maroon' : 'font-display text-forest'}`}>{children}</h2>
const Section = ({ children }: { children: React.ReactNode }) => <section className="px-5 py-5 border-t border-stone-200 print-avoid-break">{children}</section>

export default function PlacePage() {
  const { slug = '' } = useParams()
  const [p, setP] = useState<Place | null | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  const [qr, setQr] = useState<{ maps: string; page: string } | null>(null)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setP(undefined)
    loadPlace(slug).then((x) => { setP(x); if (x) document.title = `${x.name} — Q-Locate` })
    isSaved(slug).then(setSaved)
    return () => { document.title = 'Q-Locate — Quick location guide' }
  }, [slug])

  const pageUrl = typeof location !== 'undefined' ? location.href.split('?')[0] : ''
  const mapsUrl = p?.lat != null && p?.lng != null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : p ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${where(p)}`)}` : ''
  useEffect(() => {
    if (!p) return
    Promise.all([QRCode.toString(mapsUrl, { type: 'svg', margin: 0 }), QRCode.toString(pageUrl, { type: 'svg', margin: 0 })])
      .then(([maps, page]) => setQr({ maps, page })).catch(() => {})
  }, [p, mapsUrl, pageUrl])

  if (p === undefined) return <p className="p-6">Loading…</p>
  if (p === null) return (
    <main className="p-6 flex flex-col gap-3"><h1 className="m-0 font-display text-2xl">Place not found</h1>
      <p className="m-0 text-muted">It may have been removed, or you're offline and haven't saved it.</p><Link to="/">Back to home</Link></main>
  )

  const dark = p.kind === 'spiritual'
  const d = p.details ?? {}
  const phones = (p.contacts ?? []).filter((c: Place) => c.type === 'phone' || c.type === 'whatsapp')
  const website = (p.contacts ?? []).find((c: Place) => c.type === 'website')?.value
  const reel = (p.sources ?? []).find((s: Place) => (s.type === 'reel' || s.type === 'video') && s.url)
  const open = dark ? openNow(d.darshan_hours ?? [], p.country) : null
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2500) }

  const toggleSave = async () => {
    if (saved) { await unsavePlace(p.slug); setSaved(false); flash('Removed from saved') }
    else { await savePlace(p); setSaved(true); flash('Saved — available offline') }
  }
  const share = async () => {
    const data = { title: `${p.name} — Q-Locate`, text: `${p.name}, ${where(p)}`, url: pageUrl }
    if (navigator.share) { try { await navigator.share(data) } catch { /* cancelled */ } }
    else { await navigator.clipboard?.writeText(pageUrl); flash('Link copied') }
  }

  const action = 'flex flex-col items-center justify-center gap-1 min-w-[4.5rem] h-16 px-2 rounded-2xl bg-white border border-stone-200 text-xs font-semibold no-underline text-ink'
  const I = ({ d: path }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dark ? '#6B1E2A' : '#2E5B3C'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>

  return (
    <main className={`bg-sand ${dark ? 'theme-darshan' : 'theme-explore'}`}>
      {/* Print-only header */}
      <div className="print-only px-5 pt-2 pb-3 items-center gap-2 border-b border-stone-300">
        <LogoMark size={28} bg="#FFFFFF" /><b className="font-display">Q-Locate</b><span className="text-xs text-muted ml-2">Quick location guide · {pageUrl}</span>
      </div>

      <div className="relative">
        <Link to={dark ? '/darshan' : '/explore'} aria-label="Back" className="no-print absolute top-3 left-3 z-10 w-11 h-11 grid place-items-center rounded-full bg-white/90 text-ink no-underline text-2xl">‹</Link>
        <div className={`aspect-[16/10] ${dark ? 'bg-[#F3E3CC]' : 'bg-[#DDE8DD]'} print-photo${p.cover?.full ? '' : ' no-print'}`}>{p.cover?.full && <img src={p.cover.full} alt={p.name} className="w-full h-full object-cover" />}</div>
        {p.cover_credit && <div className="px-5 pt-1 text-[11px] text-muted">{p.cover_credit}</div>}
      </div>

      <header className="px-5 pt-4 pb-5 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${dark ? 'bg-saffron text-maroon' : 'bg-forest text-white'}`}>{dark ? 'Darshan' : 'Explore'}</span>
          {(p.categories ?? []).map((c: Place) => <span key={c.slug} className="text-[11px] font-semibold px-2 py-1 rounded-full bg-white border border-stone-200">{c.name}</span>)}
          {open !== null && <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${open ? 'bg-green-100 text-green-900' : 'bg-stone-200 text-stone-700'}`}>{open ? 'Open now' : 'Closed now'}</span>}
        </div>
        <h1 className={`m-0 text-[28px] leading-tight font-bold ${dark ? 'font-serif text-maroon' : 'font-display tracking-tight'}`}>{p.name}</h1>
        <p className="m-0 text-muted">{where(p)}</p>
        {p.summary && <p className="m-0 text-[17px] leading-relaxed">{p.summary}</p>}
      </header>

      <div className="no-print px-5 pb-5 flex gap-2 overflow-x-auto">
        {phones[0] && <a className={action} href={`tel:${phones[0].value.replace(/[^\d+]/g, '')}`}><I d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />Call</a>}
        <a className={action} href={mapsUrl} target="_blank" rel="noreferrer"><I d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />Directions</a>
        <button className={action} onClick={toggleSave} aria-pressed={saved}><I d="M6 3h12v18l-6-4-6 4z" />{saved ? 'Saved' : 'Save'}</button>
        <button className={action} onClick={share}><I d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" />Share</button>
        <button className={action} disabled={busy} onClick={async () => { setBusy(true); flash('Preparing PDF…'); try { await downloadPlacePdf(p, pageUrl, mapsUrl); flash('PDF downloaded') } catch { flash('Could not make the PDF. Try again.') } finally { setBusy(false) } }}><I d="M12 3v12M7 10l5 5 5-5M5 21h14" />{busy ? 'Wait…' : 'PDF'}</button>
        {website && <a className={action} href={website} target="_blank" rel="noreferrer"><I d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />Website</a>}
        {reel && <a className={action} href={reel.url} target="_blank" rel="noreferrer"><I d="M5 3l14 9-14 9V3z" />Watch</a>}
      </div>

      {(p.highlights ?? []).length > 0 && (
        <Section><H dark={dark}>Highlights</H>
          <ul className="m-0 pl-5 flex flex-col gap-2 text-[16px] leading-relaxed">{p.highlights.map((h: string, i: number) => <li key={i}>{h}</li>)}</ul>
        </Section>
      )}

      {dark && (d.darshan_hours?.length || d.dress_code || d.main_deity || d.festivals) && (
        <Section><H dark>Darshan</H>
          <dl className="m-0 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-[16px]">
            {d.main_deity && <><dt className="font-semibold">Main deity</dt><dd className="m-0">{d.main_deity}{d.tradition ? ` (${d.tradition})` : ''}</dd></>}
            {d.darshan_hours?.length > 0 && <><dt className="font-semibold">Darshan hours</dt><dd className="m-0">{d.darshan_hours.map((h: Place) => `${fmtTime(h.open)} – ${fmtTime(h.close)}`).join(', ')}</dd></>}
            {d.dress_code && <><dt className="font-semibold">Dress code</dt><dd className="m-0">{d.dress_code}</dd></>}
            {d.festivals && <><dt className="font-semibold">Festivals</dt><dd className="m-0">{d.festivals}</dd></>}
            {d.prasadam && <><dt className="font-semibold">Prasadam</dt><dd className="m-0">{d.prasadam}</dd></>}
            {d.photography && <><dt className="font-semibold">Photography</dt><dd className="m-0">{d.photography}</dd></>}
            {d.significance && <><dt className="font-semibold">Significance</dt><dd className="m-0">{d.significance}</dd></>}
            {(p.circuits ?? []).map((c: Place) => <><dt key={`t${c.slug}`} className="font-semibold">Circuit</dt><dd key={`d${c.slug}`} className="m-0">{c.name}{c.position ? ` — no. ${c.position}` : ''}</dd></>)}
          </dl>
          {d.pooja_booking_url && <a href={d.pooja_booking_url} target="_blank" rel="noreferrer" className="no-print inline-block mt-3 font-semibold">Book pooja / darshan ↗</a>}
        </Section>
      )}

      {((p.transport ?? []).length > 0 || p.how_to_reach) && (
        <Section><H dark={dark}>Getting there</H>
          <ul className="list-none m-0 p-0 flex flex-col gap-3">
            {(p.transport ?? []).map((t: Place, i: number) => (
              <li key={i} className="p-3 rounded-xl bg-white">
                {t.type === 'local' ? <><b>Local transport</b><div className="text-[15px]">{t.notes}</div></> : <>
                  <div className="flex flex-wrap items-baseline gap-x-2"><b>{t.type === 'rail' ? '🚆' : t.type === 'bus' ? '🚌' : '✈️'} {t.name}</b>{t.code && <span className="text-sm font-mono font-semibold">{t.code}</span>}<span className="text-sm text-muted">{km(t.distance_km)}</span></div>
                  {t.type === 'rail' && (t.facilities?.retiring_room || t.facilities?.dormitory || t.facilities?.ac_waiting_hall) && (
                    <ul className="m-0 mt-2 pl-5 text-sm text-muted">
                      {(t.facilities.retiring_room || t.facilities.dormitory) && <li>{[t.facilities.retiring_room && 'Retiring rooms', t.facilities.dormitory && 'dormitory'].filter(Boolean).join(' and ')} (paid) — bookable only with a confirmed ticket, via IRCTC.</li>}
                      {t.facilities.ac_waiting_hall && <li>AC waiting hall (paid) — subject to availability on arrival.</li>}
                    </ul>
                  )}
                  {t.notes && <div className="text-sm mt-1">{t.notes}</div>}
                </>}
              </li>
            ))}
          </ul>
          {p.how_to_reach && <p className="m-0 mt-3 text-[16px] leading-relaxed">{p.how_to_reach}</p>}
          <p className="m-0 mt-2 text-xs text-muted">Distances are approximate, in a straight line.</p>
        </Section>
      )}

      {(p.stays ?? []).length > 0 && (
        <Section><H dark={dark}>Where to stay</H>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {p.stays.map((s: Place, i: number) => (
              <li key={i} className="p-3 rounded-xl bg-white flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2"><b>{s.name}</b>{s.is_partner ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-stone-200">Partner</span> : null}</div>
                <div className="text-sm text-muted">{[s.type && STAY[s.type], km(s.distance_km), s.price_from ? `from ₹${Number(s.price_from).toLocaleString('en-IN')}/night${s.price_checked_on ? ` (checked ${new Date(s.price_checked_on).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})` : ''}` : ''].filter(Boolean).join(' · ')}</div>
                <div className="no-print flex gap-4 text-sm font-semibold">
                  {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>Call</a>}
                  {s.booking_url && <a href={s.booking_url} target="_blank" rel="noreferrer">Website / book ↗</a>}
                </div>
                {s.phone && <div className="print-only text-sm">{s.phone}</div>}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs text-muted">Listed, not endorsed. Prices may vary at the time of your arrival.</p>
        </Section>
      )}

      {(p.eateries ?? []).length > 0 && (
        <Section><H dark={dark}>Places to eat</H>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {p.eateries.map((s: Place, i: number) => (
              <li key={i} className="p-3 rounded-xl bg-white flex flex-wrap items-center gap-x-3 gap-y-1">
                <b>{s.name}</b>{s.pure_veg ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-900">Pure veg</span> : null}
                {s.is_partner ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-stone-200">Partner</span> : null}
                <span className="text-sm text-muted">{km(s.distance_km)}</span>
                {s.phone && <a className="no-print ml-auto text-sm font-semibold" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>Call</a>}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs text-muted">Listed, not endorsed.</p>
        </Section>
      )}

      {(p.nearby ?? []).length > 0 && (
        <Section><H dark={dark}>Nearby</H>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {p.nearby.map((n: Place, i: number) => (
              <li key={i} className="p-3 rounded-xl bg-white">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {n.linked_slug ? <Link to={placeUrl({ kind: n.linked_kind, slug: n.linked_slug })} className="font-bold">{n.name}</Link> : <b>{n.name}</b>}
                  <span className="text-sm text-muted">{km(n.distance_km)}</span>
                </div>
                {n.what_to_expect && <div className="text-sm mt-1">{n.what_to_expect}</div>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(p.access_effort || (!dark && (d.best_months?.length || d.typical_visit || d.trek_grade)) || p.timings || p.entry_fee || (p.amenities ?? []).length > 0 || p.amenities_notes) && <Section><H dark={dark}>Good to know</H>
        <dl className="m-0 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-[16px]">
          {p.access_effort && <><dt className="font-semibold">Access</dt><dd className="m-0">{ACCESS[p.access_effort]}{p.access_notes ? ` — ${p.access_notes}` : ''}</dd></>}
          {!dark && d.best_months?.length > 0 && <><dt className="font-semibold">Best months</dt><dd className="m-0">{d.best_months.map((m: number) => MONTHS[m - 1]).join(', ')}</dd></>}
          {!dark && d.typical_visit && <><dt className="font-semibold">Typical visit</dt><dd className="m-0">{VISIT[d.typical_visit]}</dd></>}
          {!dark && d.trek_grade && <><dt className="font-semibold">Trek</dt><dd className="m-0">{d.trek_grade}{d.trek_notes ? ` — ${d.trek_notes}` : ''}</dd></>}
          {p.timings && <><dt className="font-semibold">Timings</dt><dd className="m-0">{p.timings}</dd></>}
          {p.entry_fee && <><dt className="font-semibold">Entry fee</dt><dd className="m-0">{p.entry_fee}</dd></>}
          {(p.amenities ?? []).length > 0 && <><dt className="font-semibold">Amenities</dt><dd className="m-0">{p.amenities.map((a: string) => AMENITY[a] ?? a).join(', ')}</dd></>}
          {p.amenities_notes && <><dt className="font-semibold">Notes</dt><dd className="m-0">{p.amenities_notes}</dd></>}
        </dl>
        {!dark && d.trek_grade && <p className="m-0 mt-3 text-sm p-3 rounded-xl bg-amber-50 text-amber-900">Treks depend on weather and fitness. Check local conditions and go with a guide where advised.</p>}
      </Section>}

      {(p.contacts ?? []).length > 0 && (
        <Section><H dark={dark}>Contacts</H>
          <ul className="list-none m-0 p-0 flex flex-col gap-2 text-[16px]">
            {p.contacts.map((c: Place, i: number) => (
              <li key={i}>{c.label ? <span className="text-muted">{c.label}: </span> : null}
                {c.type === 'phone' || c.type === 'whatsapp' ? <a href={`${c.type === 'whatsapp' ? 'https://wa.me/' : 'tel:'}${c.value.replace(/[^\d+]/g, '').replace(c.type === 'whatsapp' ? /^\+/ : /$^/, '')}`}>{c.value}</a>
                  : c.type === 'email' ? <a href={`mailto:${c.value}`}>{c.value}</a> : <a href={c.value} target="_blank" rel="noreferrer" className="break-all">{c.value}</a>}</li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs text-muted">Please call before you travel.</p>
        </Section>
      )}

      {(p.sources ?? []).length > 0 && (
        <Section><H dark={dark}>Seen on / sources</H>
          <ul className="m-0 pl-5 flex flex-col gap-1 text-[15px]">
            {p.sources.map((s: Place, i: number) => (
              <li key={i}>{s.creator_handle && <b>{s.creator_handle} </b>}{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="break-all">{s.credit || s.url}</a> : s.credit}</li>
            ))}
          </ul>
        </Section>
      )}

      {qr && (
        <section className="print-only print-avoid-break px-5 py-4 border-t border-stone-300 gap-8">
          <div className="flex flex-col items-center gap-1 text-xs"><div className="w-28 h-28" dangerouslySetInnerHTML={{ __html: qr.maps }} />Directions (Google Maps)</div>
          <div className="flex flex-col items-center gap-1 text-xs"><div className="w-28 h-28" dangerouslySetInnerHTML={{ __html: qr.page }} />Latest details on Q-Locate</div>
        </section>
      )}

      <section className="px-5 py-4 border-t border-stone-200 text-sm text-muted flex flex-col gap-1">
        <span>Last verified: {p.verified_on ? new Date(p.verified_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'not yet'}</span>
        {CONFIG.reportEmail && <a className="no-print" href={`mailto:${CONFIG.reportEmail}?subject=${encodeURIComponent(`Outdated info: ${p.name}`)}&body=${encodeURIComponent(pageUrl + '\n\nWhat has changed:\n')}`}>Report outdated info</a>}
      </section>
      <Footer />
      {toast && <div role="status" className="no-print fixed bottom-24 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-ink text-white text-sm">{toast}</div>}
    </main>
  )
}
