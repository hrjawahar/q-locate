ALTER TABLE places ADD COLUMN wikidata_id TEXT;
ALTER TABLE places ADD COLUMN needs_review INTEGER DEFAULT 0;
ALTER TABLE places ADD COLUMN ai_pending TEXT;
ALTER TABLE places ADD COLUMN amenities_notes TEXT;
ALTER TABLE places ADD COLUMN cover_credit TEXT;
ALTER TABLE places ADD COLUMN city TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_places_wikidata ON places(wikidata_id) WHERE wikidata_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS place_transport (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('rail','bus','air','local')),
  name TEXT,
  code TEXT,
  distance_km REAL,
  facilities TEXT,
  notes TEXT,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS place_stays (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('hostel','dorm','homestay','budget_hotel','hotel','resort','dharmashala')),
  distance_km REAL,
  price_from INTEGER,
  currency TEXT DEFAULT 'INR',
  price_checked_on TEXT,
  phone TEXT,
  booking_url TEXT,
  is_partner INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS place_eateries (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pure_veg INTEGER DEFAULT 0,
  distance_km REAL,
  phone TEXT,
  is_partner INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS place_nearby (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT,
  distance_km REAL,
  what_to_expect TEXT,
  linked_place_id INTEGER,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS place_sources (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reel','video','article','official','wikidata','wikipedia','osm','photo','ai','other')),
  url TEXT,
  creator_handle TEXT,
  credit TEXT,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS import_queue (
  id INTEGER PRIMARY KEY,
  wikidata_id TEXT NOT NULL,
  label TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('vacation','spiritual')),
  category_slug TEXT,
  circuit_slug TEXT,
  circuit_position INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','skipped','error')),
  attempts INTEGER DEFAULT 0,
  error TEXT,
  place_id INTEGER,
  queued_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_status ON import_queue(status, id);
INSERT INTO place_sources (place_id, type, url, creator_handle)
  SELECT id, 'reel', source_reel_url, creator_handle FROM places
  WHERE source_reel_url IS NOT NULL OR creator_handle IS NOT NULL;
INSERT OR IGNORE INTO categories (kind, slug, name, sort) VALUES
  ('vacation','spiritual','Spiritual',13),
  ('vacation','retreat','Retreat',14),
  ('vacation','backwaters','Backwaters',15);
DELETE FROM categories WHERE kind = 'spiritual' AND slug IN ('church','dargah')
  AND id NOT IN (SELECT category_id FROM place_categories);
INSERT OR IGNORE INTO circuits (slug, name, total_count) VALUES ('chota-char-dham','Chota Char Dham',4);
