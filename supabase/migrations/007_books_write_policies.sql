-- Allow anonymous inserts for adding new books (personal app, no auth)
CREATE POLICY "Allow anonymous inserts"
  ON books FOR INSERT WITH CHECK (true);

-- Allow anonymous updates (for future metadata editing)
CREATE POLICY "Allow anonymous updates"
  ON books FOR UPDATE USING (true) WITH CHECK (true);
