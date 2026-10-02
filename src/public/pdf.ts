import { km, where, fmtTime, ACCESS, VISIT, STAY, AMENITY, MONTHS, type Place } from './data'

type RGB = [number, number, number]
const INK: RGB = [30, 42, 34], MUTED: RGB = [91, 107, 94]

// Built-in PDF fonts only cover Latin characters; swap common symbols and drop the rest.
const clean = (s: unknown) => String(s ?? '')
  .replace(/₹/g, 'Rs ').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-').replace(/…/g, '...')
  .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '').replace(/ {2,}/g, ' ').trim()

async function photoData(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    const scale = Math.min(1, 1200 / bmp.width)
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return { data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height }
  } catch { return null }
}

export async function downloadPlacePdf(p: Place, pageUrl: string, mapsUrl: string) {
  const [{ jsPDF }, QR] = await Promise.all([import('jspdf'), import('qrcode').then((m) => m.default)])
  const dark = p.kind === 'spiritual'
  const ACC: RGB = dark ? [107, 30, 42] : [46, 91, 60]
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 14, CW = W - 2 * M
  let y = M
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M } }
  const font = (size: number, style: 'normal' | 'bold' = 'normal', color: RGB = INK) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color) }
  const lh = (size: number) => size * 0.3528 * 1.4
  const text = (s: unknown, size = 10.5, style: 'normal' | 'bold' = 'normal', color: RGB = INK, x = M, width = CW) => {
    const t = clean(s); if (!t) return
    font(size, style, color)
    for (const line of doc.splitTextToSize(t, width) as string[]) { ensure(lh(size)); doc.text(line, x, y + lh(size) * 0.75); y += lh(size) }
  }
  const heading = (s: string) => {
    ensure(16); y += 4
    doc.setDrawColor(220, 214, 200); doc.line(M, y, W - M, y); y += 3
    text(s, 13, 'bold', ACC); y += 1
  }
  const row = (label: string, value: unknown) => {
    const v = clean(value); if (!v) return
    font(10.5, 'normal'); const lines = doc.splitTextToSize(v, CW - 36) as string[]
    ensure(lh(10.5) * lines.length)
    font(10.5, 'bold'); doc.text(clean(label), M, y + lh(10.5) * 0.75)
    font(10.5, 'normal'); lines.forEach((l, i) => doc.text(l, M + 36, y + lh(10.5) * (i + 0.75)))
    y += lh(10.5) * lines.length + 1
  }
  const bullet = (s: unknown, sub?: unknown) => {
    const t = clean(s); if (!t) return
    ensure(lh(10.5)); font(10.5, 'normal', ACC); doc.text('-', M + 1, y + lh(10.5) * 0.75)
    text(t, 10.5, 'normal', INK, M + 5, CW - 5)
    if (sub) text(sub, 9.5, 'normal', MUTED, M + 5, CW - 5)
    y += 0.8
  }

  // Header bar
  font(9, 'bold', ACC); doc.text('Q-Locate', M, y + 3)
  font(9, 'normal', MUTED); doc.text('Quick location guide', M + 17, y + 3)
  doc.text(clean(pageUrl.replace(/^https?:\/\//, '')), W - M, y + 3, { align: 'right' })
  y += 7

  if (p.cover?.full) {
    const img = await photoData(p.cover.full)
    if (img) {
      const h = Math.min(75, (CW * img.h) / img.w)
      doc.addImage(img.data, 'JPEG', M, y, CW, h, undefined, 'FAST'); y += h + 1
      if (p.cover_credit) text(p.cover_credit, 7.5, 'normal', MUTED)
      y += 2
    }
  }

  text([dark ? 'DARSHAN' : 'EXPLORE', ...(p.categories ?? []).map((c: Place) => c.name)].join('  -  '), 8.5, 'bold', ACC)
  y += 1
  text(p.name, 20, 'bold', dark ? ACC : INK)
  text(where(p), 10.5, 'normal', MUTED)
  y += 1
  text(p.summary, 11)

  const d = p.details ?? {}
  if ((p.highlights ?? []).length) { heading('Highlights'); p.highlights.forEach((h: string) => bullet(h)) }

  if (dark && (d.main_deity || d.darshan_hours?.length || d.dress_code || d.festivals || (p.circuits ?? []).length)) {
    heading('Darshan')
    if (d.main_deity) row('Main deity', `${d.main_deity}${d.tradition ? ` (${d.tradition})` : ''}`)
    if (d.darshan_hours?.length) row('Darshan hours', d.darshan_hours.map((h: Place) => `${fmtTime(h.open)} - ${fmtTime(h.close)}`).join(', '))
    row('Dress code', d.dress_code); row('Festivals', d.festivals); row('Prasadam', d.prasadam); row('Photography', d.photography); row('Significance', d.significance)
    ;(p.circuits ?? []).forEach((c: Place) => row('Circuit', `${c.name}${c.position ? ` - no. ${c.position}` : ''}`))
  }

  if ((p.transport ?? []).length || p.how_to_reach) {
    heading('Getting there')
    ;(p.transport ?? []).forEach((t: Place) => {
      if (t.type === 'local') return bullet('Local transport', t.notes)
      const label = { rail: 'Train', bus: 'Bus', air: 'Air' }[t.type as string] ?? ''
      const f = t.facilities ?? {}
      const notes = [
        t.type === 'rail' && (f.retiring_room || f.dormitory) ? `${[f.retiring_room && 'Retiring rooms', f.dormitory && 'dormitory'].filter(Boolean).join(' and ')} (paid) - bookable only with a confirmed ticket, via IRCTC.` : '',
        t.type === 'rail' && f.ac_waiting_hall ? 'AC waiting hall (paid) - subject to availability on arrival.' : '',
        t.notes,
      ].filter(Boolean).join(' ')
      bullet(`${label}: ${t.name}${t.code ? ` (${t.code})` : ''} - ${km(t.distance_km)}`, notes)
    })
    if (p.how_to_reach) { y += 1; text(p.how_to_reach) }
    text('Distances are approximate, in a straight line.', 8.5, 'normal', MUTED)
  }

  if ((p.stays ?? []).length) {
    heading('Where to stay')
    p.stays.forEach((s: Place) => bullet(`${s.name}${s.is_partner ? ' [Partner]' : ''}`, [s.type && STAY[s.type], km(s.distance_km),
      s.price_from ? `from Rs ${Number(s.price_from).toLocaleString('en-IN')}/night${s.price_checked_on ? ` (checked ${new Date(s.price_checked_on).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})` : ''}` : '', s.phone].filter(Boolean).join(' - ')))
    text('Listed, not endorsed. Prices may vary at the time of your arrival.', 8.5, 'normal', MUTED)
  }

  if ((p.eateries ?? []).length) {
    heading('Places to eat')
    p.eateries.forEach((s: Place) => bullet(`${s.name}${s.pure_veg ? ' (Pure veg)' : ''}${s.is_partner ? ' [Partner]' : ''}`, [km(s.distance_km), s.phone].filter(Boolean).join(' - ')))
    text('Listed, not endorsed.', 8.5, 'normal', MUTED)
  }

  if ((p.nearby ?? []).length) { heading('Nearby'); p.nearby.forEach((n: Place) => bullet(`${n.name} - ${km(n.distance_km)}`, n.what_to_expect)) }

  const good: [string, unknown][] = [
    ['Access', p.access_effort ? `${ACCESS[p.access_effort]}${p.access_notes ? ` - ${p.access_notes}` : ''}` : ''],
    ['Best months', !dark && d.best_months?.length ? d.best_months.map((m: number) => MONTHS[m - 1]).join(', ') : ''],
    ['Typical visit', !dark && d.typical_visit ? VISIT[d.typical_visit] : ''],
    ['Trek', !dark && d.trek_grade ? `${d.trek_grade}${d.trek_notes ? ` - ${d.trek_notes}` : ''}` : ''],
    ['Timings', p.timings], ['Entry fee', p.entry_fee],
    ['Amenities', (p.amenities ?? []).map((a: string) => AMENITY[a] ?? a).join(', ')], ['Notes', p.amenities_notes],
  ]
  if (good.some(([, v]) => v)) { heading('Good to know'); good.forEach(([k, v]) => row(k, v)) }

  if ((p.contacts ?? []).length) {
    heading('Contacts')
    p.contacts.forEach((c: Place) => row(c.label || ({ phone: 'Phone', whatsapp: 'WhatsApp', email: 'Email', website: 'Website' }[c.type as string] ?? 'Contact'), c.value))
    text('Please call before you travel.', 8.5, 'normal', MUTED)
  }

  // QR codes
  const [qMaps, qPage] = await Promise.all([QR.toDataURL(mapsUrl, { margin: 1, width: 300 }), QR.toDataURL(pageUrl, { margin: 1, width: 300 })])
  ensure(46); y += 5
  doc.addImage(qMaps, 'PNG', M, y, 32, 32); doc.addImage(qPage, 'PNG', M + 50, y, 32, 32)
  font(8.5, 'normal', MUTED); doc.text('Directions (Google Maps)', M + 16, y + 36, { align: 'center' }); doc.text('Latest details on Q-Locate', M + 66, y + 36, { align: 'center' })
  y += 42

  text(`Last verified: ${p.verified_on ? new Date(p.verified_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'not yet'}   |   Downloaded: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`, 8.5, 'normal', MUTED)
  y += 1
  text('Information is for reference; confirm timings, prices and availability before you travel. Data from Wikidata, GeoNames and (c) OpenStreetMap contributors; photos via Wikimedia Commons where credited; some text drafted with AI and checked by Q-Locate.', 7.5, 'normal', MUTED)

  doc.save(`${p.slug}-q-locate.pdf`)
}
