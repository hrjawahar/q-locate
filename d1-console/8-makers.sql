CREATE TABLE IF NOT EXISTS makers (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  products TEXT,
  category TEXT,
  village TEXT,
  district TEXT,
  state TEXT,
  country TEXT DEFAULT 'India',
  phone TEXT,
  about TEXT,
  consent INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_makers_status ON makers(status);
