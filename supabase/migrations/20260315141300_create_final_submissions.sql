CREATE TABLE IF NOT EXISTS final_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES race_sessions(id) ON DELETE CASCADE UNIQUE,
  final_layer TEXT NOT NULL,
  final_score INTEGER NOT NULL,
  output_snapshot JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
