-- Festivals: annual festivals in India and abroad, linked to places where relevant.
CREATE TABLE IF NOT EXISTS festivals (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  alt_names TEXT,
  country TEXT,
  state TEXT,
  towns TEXT,
  kind TEXT CHECK (kind IN ('religious','cultural','both')),
  months TEXT,
  next_start TEXT,
  next_end TEXT,
  dates_checked_on TEXT,
  summary TEXT,
  tips TEXT,
  refs TEXT,
  wikidata_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  ai_pending TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS festival_places (
  festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  PRIMARY KEY (festival_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_festivals_status ON festivals(status);
CREATE INDEX IF NOT EXISTS idx_festival_places_place ON festival_places(place_id);
