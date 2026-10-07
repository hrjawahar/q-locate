// Shared word search: light stemming (marriage / married / marriages match), common synonyms,
// and a short snippet showing where a word was found.

const SUFFIX = /(ations?|ings?|ies|es|ed|ly|s|e)$/
/** Reduce a word to a rough stem so different forms match. */
export const stem = (w: string) => {
  const t = w.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  return t.length > 4 ? t.replace(SUFFIX, '') : t
}

// Words people use for the same thing (mostly temple remedies and travel needs).
const GROUPS = [
  ['marriage', 'wedding', 'vivah', 'vivaha', 'kalyanam', 'kalyana', 'marry', 'spouse'],
  ['child', 'children', 'childbirth', 'progeny', 'santhana', 'santana', 'pregnancy', 'fertility'],
  ['education', 'studies', 'study', 'exam', 'exams', 'learning', 'vidya', 'knowledge'],
  ['career', 'job', 'jobs', 'employment', 'promotion'],
  ['health', 'disease', 'illness', 'cure', 'healing', 'ailment'],
  ['wealth', 'money', 'prosperity', 'debt', 'business'],
  ['dosha', 'dosham', 'dosh'],
  ['navagraha', 'planet', 'planets', 'graha'],
  ['waterfall', 'falls', 'cascade'],
  ['beach', 'sea', 'seaside', 'coast'],
  ['trek', 'trekking', 'hike', 'hiking'],
  ['movie', 'film'],
  ['festival', 'festivals', 'fest', 'utsav', 'utsavam', 'mela', 'jatra', 'celebration'],
  ['harvest', 'pongal', 'onam', 'bihu', 'lohri', 'makar sankranti'],
  ['boat race', 'vallam kali', 'snake boat'],
  ['romance', 'love', 'romantic'],
  ['aviation', 'aircraft', 'airplane', 'flight', 'pilot'],
  ['self-help', 'selfhelp', 'motivation', 'habits'],
]
const SYN = new Map<string, string[]>()
for (const g of GROUPS) for (const w of g) SYN.set(stem(w), g.filter((x) => x !== w))

/** MiniSearch options: same stemming for indexing and searching. */
const STOP = new Set(['the', 'in', 'of', 'and', 'for', 'to', 'a', 'an', 'near', 'at', 'with', 'on', 'is', 'by', 'from', 'or', 'best', 'good', 'place', 'places'])
export const processTerm = (t: string) => (t.length < 2 || STOP.has(t.toLowerCase()) ? null : stem(t))

/** Expand a query with synonyms, e.g. "wedding" → "wedding marriage vivaha …" (OR search). */
export const expand = (q: string) => {
  const words = q.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean)
  return [...new Set(words.flatMap((w) => [w, ...(SYN.get(stem(w)) ?? [])]))].join(' ')
}

/** A short piece of text around the first matching word, for showing why a result matched. */
export function snippet(text: string | undefined, q: string, len = 90): string {
  if (!text) return ''
  const words = expand(q).split(' ').map(stem).filter((w) => w.length > 2)
  const lower = text.toLowerCase()
  let at = -1
  for (const w of words) { const i = lower.search(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)); if (i >= 0 && (at < 0 || i < at)) at = i }
  if (at < 0) return ''
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 30)))
  const out = text.slice(start, start + len).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${out}${start + len < text.length ? '…' : ''}`
}
