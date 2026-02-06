-- Allow anonymous deletes for removing books (personal app, no auth)
CREATE POLICY "Allow anonymous deletes"
  ON books FOR DELETE USING (true);
