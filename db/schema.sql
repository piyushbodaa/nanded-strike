-- Initialize once with npm run db:setup after DATABASE_URL is configured.
-- Match state and private session hashes stay in separate columns.
CREATE TABLE IF NOT EXISTS game_rooms (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  sessions TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS game_rooms_updated_at_idx ON game_rooms (updated_at);
