CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  year INTEGER,
  country TEXT,
  language TEXT,
  subtitles TEXT,
  genres TEXT,
  doc_topic TEXT,
  runtime_min INTEGER,
  pitch TEXT,
  family_friendly INTEGER,
  wikidata_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  ai_pending TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS movie_recs (
  id INTEGER PRIMARY KEY,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  handle TEXT,
  url TEXT,
  note TEXT,
  sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_movie_recs_movie ON movie_recs(movie_id);
CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
