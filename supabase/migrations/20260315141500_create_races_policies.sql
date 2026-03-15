CREATE POLICY "Anyone can read races"
  ON races FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert races"
  ON races FOR INSERT
  WITH CHECK (true);
