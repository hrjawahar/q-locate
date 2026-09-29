-- Q-Locate schema v1 (D1 / SQLite)

CREATE TABLE places (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('vacation','spiritual')),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  alt_names     TEXT,
  country       TEXT NOT NULL DEFAULT 'India',
  state         TEXT,
  district_city TEXT,
  lat REAL, lng REAL,
  summary       TEXT,
  highlights    TEXT,            -- JSON array of 3-5 short strings
  how_to_reach  TEXT,
  stay_nearby   TEXT,            -- e.g. 'Homestays, budget hotels, resorts'
  amenities     TEXT,            -- JSON array: parking, food, restroom, wheelchair, atm, wifi
  entry_fee     TEXT,
  access_effort TEXT CHECK (access_effort IN ('drive_up','short_walk','steps_climb','trek')),
  access_notes  TEXT,
  timings       TEXT,
  tags          TEXT,
  cover_photo   TEXT,            -- R2 key base; files are <key>-1200.webp and <key>-400.webp
  source_reel_url TEXT,
  creator_handle  TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  verified_on   TEXT,
  created_by    TEXT,
  updated_by    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_places_kind_status ON places(kind, status);
CREATE INDEX idx_places_state ON places(country, state);

CREATE TABLE vacation_details (
  place_id      INTEGER PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  best_months   TEXT,            -- '10,11,12,1,2'
  typical_visit TEXT CHECK (typical_visit IN ('few_hours','1_day','2_3_days','week_plus')),
  trek_grade    TEXT CHECK (trek_grade IN ('easy','moderate','hard')),
  trek_notes    TEXT
);

CREATE TABLE temple_details (
  place_id      INTEGER PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  main_deity    TEXT,
  tradition     TEXT,
  significance  TEXT,
  darshan_hours TEXT,            -- JSON: [{"open":"05:30","close":"12:30"}]
  dress_code    TEXT,
  festivals     TEXT,
  pooja_booking_url TEXT,
  photography   TEXT,
  prasadam      TEXT
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('vacation','spiritual')),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  sort INTEGER DEFAULT 0,
  UNIQUE(kind, slug)
);
CREATE TABLE place_categories (
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id),
  PRIMARY KEY (place_id, category_id)
);

CREATE TABLE circuits (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  total_count INTEGER
);
CREATE TABLE place_circuits (
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  circuit_id INTEGER REFERENCES circuits(id),
  position INTEGER,
  PRIMARY KEY (place_id, circuit_id)
);

CREATE TABLE place_contacts (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  type  TEXT CHECK (type IN ('phone','whatsapp','website','email','booking','instagram')),
  label TEXT,
  value TEXT NOT NULL
);

CREATE TABLE place_photos (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  credit TEXT,
  sort INTEGER DEFAULT 0
);

CREATE TABLE admins (
  email TEXT PRIMARY KEY,
  name  TEXT,
  role  TEXT NOT NULL CHECK (role IN ('owner','publisher','editor')),
  scope TEXT DEFAULT 'all' CHECK (scope IN ('all','vacation','spiritual')),
  active INTEGER DEFAULT 1,
  invited_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT DEFAULT (datetime('now')),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  diff TEXT
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
INSERT INTO meta (key, value) VALUES ('index_version', '1');

-- Community stage 1
CREATE TABLE community_waitlist (
  id INTEGER PRIMARY KEY,
  contact TEXT NOT NULL,
  interests TEXT,
  consent_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Community stage 2 (created now, used later)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','muted','banned')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE tips (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) <= 500),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
