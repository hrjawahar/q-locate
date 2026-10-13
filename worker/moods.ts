// Moods for Bibliotherapy (books) and Cinematherapy (films), plus the category lists.
// One shared copy for the public app, the admin app and the workers. Keys are stored; labels are shown.

/** Going through something. */
export const MOODS_HARD: Record<string, string> = {
  low: 'Feeling low', anxious: 'Anxious or restless', lonely: 'Lonely', heartbroken: 'Heartbroken', grief: 'Grieving a loss',
  stressed: 'Stressed at work', stuck: 'Lost or stuck', angry: 'Angry or frustrated', fed_up: 'Fed up or disillusioned',
  afraid: 'Afraid or facing a challenge',
}
/** In the mood for… */
export const MOODS_GOOD: Record<string, string> = {
  happy: 'Happy, want more of it', love: 'In love', calm: 'Calm and reflective', laugh: 'Want to laugh', escape: 'Want an escape',
  adventurous: 'Adventurous', curious: 'Curious', inspired: 'Want to feel inspired', motivation: 'Need motivation',
  fresh_start: 'Fresh start', meaning: 'Seeking meaning', travel: 'Travelling', nostalgic: 'Nostalgic',
  courage: 'Want courage', moved: 'Want a good cry', thrill: 'Want a thrill', wonder: 'Want to feel wonder',
}
export const MOODS: Record<string, string> = { ...MOODS_HARD, ...MOODS_GOOD }

export const moodKeys = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map(String).filter((k) => k in MOODS))].slice(0, 4) : [])
export const MOOD_PROMPT = `"moods": [2 to 4 keys from: ${Object.entries(MOODS).map(([k, l]) => `${k} (${l})`).join(', ')} — the moods this genuinely suits: for difficult moods (${Object.keys(MOODS_HARD).join(', ')}) only if it would comfort or help someone in that state; fresh_start = a new job, move or new year; meaning = spiritual or philosophical search; travel = set in a place worth visiting or about journeys; angry = helps channel or understand anger; fed_up = restores faith in people; afraid = steadying, gives courage (never horror); courage = heroism, standing up, grit; moved = compassion, tears that heal; thrill = suspense, horror or edge-of-the-seat, for people who enjoy fear (never for anxious or afraid); wonder = awe, the marvellous, epic scale],
 "mood_note": "one gentle line, at most 140 characters, on why it may suit someone in those moods; no promises, no clinical claims"`

// Categories
export const BOOK_FICTION = ['Literary fiction', 'Thriller', 'Mystery', 'Crime', 'Romance', 'Fantasy', 'Sci-fi', 'Historical fiction', 'Mythology', 'Political fiction',
  'Humour', 'Classic', 'Short stories', 'Graphic novel', 'Children', 'Young adult']
export const BOOK_NONFICTION = [
  // Faith and inner life
  'Spirituality', 'Sanatan Dharma', 'Hinduism', 'Religion', 'Scriptures & epics', 'Mythology & legends', 'Astrology', 'Vastu', 'Yoga & meditation', 'Ayurveda',
  // Self and others
  'Self-help', 'Reflections & essays', 'Psychology', 'Philosophy', 'Relationships', 'Parenting', 'Health',
  // Work and society
  'Leadership', 'Coaching & mentoring', 'Career', 'Productivity', 'Business', 'Entrepreneurship', 'Finance', 'Economics',
  'Politics', 'Governance & public policy', 'Law', 'Current affairs', 'Society & culture', 'Education', 'Environment',
  // Lives and the world
  'Biography', 'Memoir', 'History', 'Science', 'Technology', 'Travel', 'Food & cooking', 'Art & music', 'Sports', 'Poetry', 'True crime']
export const MOVIE_GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Devotional', 'Documentary', 'Drama', 'Family', 'Fantasy',
  'History', 'Horror', 'Musical', 'Mystery', 'Mythology', 'Political', 'Romance', 'Sci-fi', 'Sports', 'Thriller', 'Travel', 'War', 'Western']
