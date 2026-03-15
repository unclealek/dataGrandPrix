CREATE POLICY "Anyone can read race sessions"
  ON race_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert race sessions"
  ON race_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update race sessions"
  ON race_sessions FOR UPDATE
  USING (true);
