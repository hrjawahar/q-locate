import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api'

interface Item { at: string; actor: string; action: string; entity: string; entity_id: string; place_name: string | null }

export default function Activity() {
  const [items, setItems] = useState<Item[] | null>(null)
  useEffect(() => { api<{ items: Item[] }>('/activity').then((d) => setItems(d.items)) }, [])
  return (
    <section className="flex flex-col gap-4">
      <h1 className="m-0 font-display text-2xl font-bold">Activity</h1>
      {!items ? <p>Loading…</p> : (
        <ul className="list-none m-0 p-0 divide-y divide-stone-200 border border-stone-200 rounded-xl text-sm">
          {items.map((i, n) => (
            <li key={n} className="p-3 flex flex-wrap gap-x-3">
              <span className="text-muted w-40">{i.at} UTC</span>
              <span className="font-semibold">{i.actor}</span>
              <span>{i.action.replace('status:', '→ ')}</span>
              {i.entity === 'place' && i.place_name
                ? <Link to={`/admin/places/${i.entity_id}`}>{i.place_name}</Link>
                : <span className="text-muted">{i.entity} {i.entity_id}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
