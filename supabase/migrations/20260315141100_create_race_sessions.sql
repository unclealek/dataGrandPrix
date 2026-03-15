CREATE TABLE IF NOT EXISTS race_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  active_layer TEXT NOT NULL DEFAULT 'bronze',
  current_score INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
