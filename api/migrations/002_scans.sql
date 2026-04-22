-- Up Migration
CREATE TABLE scans (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vt_analysis_id  TEXT UNIQUE NOT NULL,
  file_name       TEXT NOT NULL,
  file_sha256     TEXT NOT NULL,
  file_size       BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scans_user_created_idx ON scans (user_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS scans;
