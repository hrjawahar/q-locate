import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export interface Pin { lat: number; lng: number; name: string; to: string; dark: boolean }

// Small OpenStreetMap map with one dot per place (green = Explore, maroon = Darshan). Tap a dot to open the place.
// Leaflet is loaded only when a map is shown, so other pages stay light.
export default function PinMap({ pins, className = '' }: { pins: Pin[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  useEffect(() => {
    if (!el.current || !pins.length) return
    let map: import('leaflet').Map | null = null
    let cancelled = false
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([L]) => {
      if (cancelled || !el.current) return
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true })
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map)
      const pts: [number, number][] = []
      for (const p of pins) {
        const c = p.dark ? '#6B1E2A' : '#2E5B3C'
        L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: c, fillOpacity: 1 })
          .bindTooltip(p.name, { direction: 'top', offset: [0, -8] })
          .on('click', () => nav(p.to))
          .addTo(map)
        pts.push([p.lat, p.lng])
      }
      if (pts.length === 1) map.setView(pts[0], 12)
      else map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 13 })
    })
    return () => { cancelled = true; map?.remove() }
  }, [pins, nav])
  if (!pins.length) return null
  return <div ref={el} role="img" aria-label="Map of places" className={`h-64 rounded-2xl overflow-hidden border border-stone-200 bg-[#E8EFE8] relative z-0 isolate${className}`} />
}
