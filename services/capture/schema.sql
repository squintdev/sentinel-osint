-- SENTINEL playback capture store
-- Position snapshots (high volume, same id repeats across captures)
-- Event tables (low volume, dedup by id)

CREATE TABLE IF NOT EXISTS flights (
  ts INTEGER NOT NULL,
  id TEXT NOT NULL,
  callsign TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  altitude REAL,
  country TEXT,
  military INTEGER NOT NULL DEFAULT 0,
  type TEXT,
  description TEXT,
  operator TEXT,
  PRIMARY KEY (ts, id)
);
CREATE INDEX IF NOT EXISTS idx_flights_ts ON flights(ts);

CREATE TABLE IF NOT EXISTS earthquakes (
  id TEXT PRIMARY KEY,
  first_seen_ts INTEGER NOT NULL,
  magnitude REAL,
  place TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  event_time TEXT,
  event_ts INTEGER,
  depth REAL
);
CREATE INDEX IF NOT EXISTS idx_earthquakes_event_ts ON earthquakes(event_ts);

CREATE TABLE IF NOT EXISTS intel (
  id TEXT PRIMARY KEY,
  first_seen_ts INTEGER NOT NULL,
  timestamp TEXT,
  category TEXT,
  headline TEXT,
  source TEXT,
  entities TEXT,
  priority TEXT,
  lat REAL,
  lng REAL
);
CREATE INDEX IF NOT EXISTS idx_intel_first_seen ON intel(first_seen_ts);
CREATE INDEX IF NOT EXISTS idx_intel_headline ON intel(headline);

CREATE TABLE IF NOT EXISTS gdelt (
  id TEXT PRIMARY KEY,
  first_seen_ts INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  event_code TEXT,
  root_code TEXT,
  tone REAL,
  goldstein REAL,
  location TEXT,
  source_url TEXT,
  actor1 TEXT,
  actor2 TEXT,
  num_mentions INTEGER,
  priority TEXT
);
CREATE INDEX IF NOT EXISTS idx_gdelt_first_seen ON gdelt(first_seen_ts);
