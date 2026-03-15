CREATE TABLE IF NOT EXISTS sql_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES race_sessions(id) ON DELETE CASCADE,
  layer TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  sql_text TEXT NOT NULL,
  preview_row_count INTEGER,
  score_after INTEGER,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
