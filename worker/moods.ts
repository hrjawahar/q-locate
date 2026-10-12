// Moods for Bibliotherapy (books) and Cinematherapy (films), plus the category lists.
// One shared copy for the public app, the admin app and the workers. Keys are stored; labels are shown.

/** Going through something. */
export const MOODS_HARD: Record<string, string> = {
  low: 'Feeling low', anxious: 'Anxious or restless', lonely: 'Lonely', heartbroken: 'Heartbroken', grief: 'Grieving a loss',
  stressed: 'Stressed at work', stuck: 'Lost or stuck',
}
/** In the mood for… */
export const MOODS_GOOD: Record<string, string> = {
  happy: 'Happy, want more of it', love: 'In love', calm: 'Calm and reflective', laugh: 'Want to laugh', escape: 'Want an escape',
  adventurous: 'Adventurous', curious: 'Curious', inspired: 'Want to feel inspired', motivation: 'Need motivation',
  fresh_start: 'Fresh start', meaning: 'Seeking meaning', travel: 'Travelling', nostalgic: 'Nostalgic',
}
export const MOODS: Record<string, string> = { ...MOODS_HARD, ...MOODS_GOOD }

export const moodKeys = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(String).filter((k) => k in MOODS))].slice(0, 4) : [])
export const MOOD_PROMPT = `"moods": [2 to 4 keys from: ${Object.entries(MOODS).map(([k, l]) => `${k} (${l})`).join(', ')} — the moods this genuinely suits: for difficult moods (${Object.keys(MOODS_HARD).join(', ')}) only if it would comfort or help someone in that state; fresh_start = a new job, move or new year; meaning = spiritual or philosophical search; travel = set in a place worth visiting or about journeys],
 "mood_note": "one gentle line, at most 140 characters, on why it may suit someone in those moods; no promises, no clinical claims"`

// Categories
export const BOOK_FICTION = ['Literary fiction', 'Thriller', 'Mystery', 'Crime', 'Romance', 'Fantasy', 'Sci-fi', 'Historical fiction', 'Mythology', 'Humour', 'Classic', 'Short stories', 'Young adult']
export const BOOK_NONFICTION = ['Biography', 'Memoir', 'Self-help', 'Business', 'Finance', 'History', 'Science', 'Psychology', 'Philosophy', 'Spirituality',
  'Scriptures & epics', 'Astrology', 'Vastu', 'Yoga & meditation', 'Ayurveda', 'Travel', 'Health', 'Poetry', 'True crime']
export const MOVIE_GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Devotional', 'Documentary', 'Drama', 'Family', 'Fantasy',
  'History', 'Horror', 'Musical', 'Mystery', 'Mythology', 'Romance', 'Sci-fi', 'Sports', 'Thriller', 'Travel', 'War', 'Western']
