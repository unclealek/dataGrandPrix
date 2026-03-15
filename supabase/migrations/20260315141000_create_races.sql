CREATE TABLE IF NOT EXISTS races (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_key TEXT NOT NULL UNIQUE,
  seed BIGINT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'v1',
  base_row_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
