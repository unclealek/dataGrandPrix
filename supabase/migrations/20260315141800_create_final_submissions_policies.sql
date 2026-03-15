CREATE POLICY "Anyone can read final submissions"
  ON final_submissions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert final submissions"
  ON final_submissions FOR INSERT
  WITH CHECK (true);
