// Moods for Bibliotherapy (books) and Cinematherapy (films). Keys are stored; labels are shown.
export const MOODS: Record<string, string> = {
  low: 'Feeling low', anxious: 'Anxious or restless', lonely: 'Lonely', heartbroken: 'Heartbroken', grief: 'Grieving a loss',
  stressed: 'Stressed at work', stuck: 'Lost or stuck', motivation: 'Need motivation', laugh: 'Want to laugh', escape: 'Want an escape',
  curious: 'Curious', nostalgic: 'Nostalgic', inspired: 'Want to feel inspired',
}
export const moodKeys = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(String).filter((k) => k in MOODS))].slice(0, 4) : [])
export const MOOD_PROMPT = `"moods": [2 to 4 keys from: ${Object.entries(MOODS).map(([k, l]) => `${k} (${l})`).join(', ')} — the moods this suits; only moods a reader/viewer in that state would genuinely find comforting, uplifting or helpful],
 "mood_note": "one gentle line, at most 140 characters, on why it may help someone in those moods; no promises, no clinical claims"`
