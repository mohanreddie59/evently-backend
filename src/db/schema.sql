PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('host','volunteer','admin')),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'Other',
  date          TEXT NOT NULL,
  location      TEXT NOT NULL,
  budget        INTEGER NOT NULL CHECK (budget > 0),
  status        TEXT NOT NULL CHECK (status IN ('open','assigned','completed','cancelled')) DEFAULT 'open',
  host_id       TEXT NOT NULL REFERENCES users(id),
  volunteer_id  TEXT REFERENCES users(id),
  fee           INTEGER,
  fee_paid      INTEGER NOT NULL DEFAULT 0,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_host ON events(host_id);
CREATE INDEX IF NOT EXISTS idx_events_volunteer ON events(volunteer_id);
