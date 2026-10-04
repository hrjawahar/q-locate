CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  year INTEGER,
  language TEXT,
  fiction INTEGER,
  genres TEXT,
  topic TEXT,
  pages INTEGER,
  pitch TEXT,
  wikidata_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  ai_pending TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS book_recs (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  handle TEXT,
  url TEXT,
  note TEXT,
  sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_book_recs_book ON book_recs(book_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
