-- Enable RLS on books and allow anonymous reads
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON books FOR SELECT USING (true);

ALTER TABLE book_vibes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON book_vibes FOR SELECT USING (true);
