CREATE POLICY "Allow anonymous updates"
  ON book_vibes FOR UPDATE USING (true) WITH CHECK (true);
