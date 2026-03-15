CREATE POLICY "Anyone can read SQL attempts"
  ON sql_attempts FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert SQL attempts"
  ON sql_attempts FOR INSERT
  WITH CHECK (true);
