-- Up Migration
CREATE TABLE messages (
  id         BIGSERIAL PRIMARY KEY,
  scan_id    BIGINT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_scan_created_idx ON messages (scan_id, created_at);

-- Down Migration
DROP TABLE IF EXISTS messages;
