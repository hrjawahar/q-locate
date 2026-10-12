import { useEffect, useRef, useState } from 'react'

import { MOODS, MOODS_HARD, MOODS_GOOD } from '../../worker/moods'
export { MOODS }
/** Moods where we add a gentle reminder that support is available. */
const HEAVY = new Set(['low', 'grief', 'heartbroken', 'lonely'])
// Words suggesting someone may be at risk (English and common Hindi/Tamil transliterations).
const CRISIS = /\b(suicid\w*|kill (my ?self|me)|end (my|it all)|want(ed)? to die|wanna die|self[- ]?harm|hurt(ing)? my ?self|no reason to live|better off dead|aatmahatya|atmahatya|khudkushi|marna chahta|marna chahti|saaga poren|thatkolai)\b/i
export const isCrisis = (t: string) => CRISIS.test(t)

const TERMS = {
  book: { term: 'Bibliotherapy', def: 'Choosing books to match how you feel — a story or idea that keeps you company, lifts your mood or helps you see things differently. A gentle self-help practice, not a treatment.' },
  movie: { term: 'Cinematherapy', def: 'Choosing films to match how you feel — to comfort, calm, lift or inspire you. A gentle self-help practice, not a treatment.' },
}

/** The word with its definition: shows on hover (computer) and on tap (phone). */
function Term({ kind }: { kind: 'book' | 'movie' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const t = TERMS[kind]
  return (
    <span ref={ref} className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-describedby={`term-${kind}`} onClick={() => setOpen(!open)}
        className="font-bold underline decoration-dotted decoration-2 underline-offset-4 cursor-help">{t.term} <span aria-hidden="true" className="text-xs align-top">ⓘ</span></button>
      <span id={`term-${kind}`} role="tooltip" className={`${open ? 'block' : 'hidden'} absolute z-20 left-0 top-full mt-2 w-72 max-w-[80vw] p-3 rounded-xl bg-ink text-white text-sm font-normal leading-relaxed shadow-lg`}>
        {t.def}
      </span>
    </span>
  )
}

export function CareNote({ strong }: { strong?: boolean }) {
  return strong ? (
    <div role="alert" className="p-4 rounded-2xl bg-[#FDECEC] text-[#6B1E1E] flex flex-col gap-2">
      <p className="m-0 font-bold">You don’t have to carry this alone.</p>
      <p className="m-0 text-sm leading-relaxed">If you’re thinking about harming yourself, please talk to someone now. Tele-MANAS, India’s free and confidential mental health helpline, is open 24×7.</p>
      <a href="tel:14416" className="self-start h-11 px-5 grid place-items-center rounded-xl bg-[#6B1E1E] text-white font-bold no-underline">Call 14416</a>
      <p className="m-0 text-xs">Or 1-800-891-4416. If you’re in immediate danger, call 112.</p>
    </div>
  ) : (
    <p className="m-0 text-sm p-3 rounded-xl bg-white leading-relaxed">Books and films can be good company, but they’re not a substitute for talking to someone. If things feel heavy, India’s free 24×7 mental health helpline <b>Tele-MANAS</b> is <a href="tel:14416" className="font-bold">14416</a>.</p>
  )
}

/** "How are you feeling?" — mood chips plus a free-text box. */
export default function MoodBar({ kind, mood, setMood, feel, setFeel }: { kind: 'book' | 'movie'; mood: string; setMood: (m: string) => void; feel: string; setFeel: (s: string) => void }) {
  const chip = (on: boolean) => `shrink-0 h-10 px-4 rounded-full border text-sm font-semibold ${on ? 'bg-forest text-white border-forest' : 'bg-white border-stone-300 text-ink'}`
  return (
    <section aria-label="Pick by how you feel" className="mx-5 p-4 rounded-2xl bg-[#EEF3EC] flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="m-0 font-display text-lg font-semibold">How are you feeling today?</h2>
        <span className="text-sm text-muted"><Term kind={kind} /></span>
      </div>
      {([['In the mood for…', MOODS_GOOD], ['Going through something', MOODS_HARD]] as const).map(([title, list]) => (
        <div key={title} className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">{title}</span>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={title}>
            {Object.entries(list).map(([k, l]) => <button key={k} aria-pressed={mood === k} className={chip(mood === k)} onClick={() => setMood(mood === k ? '' : k)}>{l}</button>)}
          </div>
        </div>
      ))}
      <label className="flex items-center gap-2 h-11 px-3 bg-white border border-stone-300 rounded-xl">
        <span className="sr-only">Or describe how you feel</span>
        <input value={feel} onChange={(e) => setFeel(e.target.value)} placeholder="Or describe it in your own words…" className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" />
        {feel && <button type="button" aria-label="Clear" className="text-muted" onClick={() => setFeel('')}>✕</button>}
      </label>
      <p className="m-0 text-xs text-muted">What you type is used only to find matches — Q-Locate doesn’t store it.</p>
      {(isCrisis(feel) || HEAVY.has(mood)) && <CareNote strong={isCrisis(feel)} />}
    </section>
  )
}
