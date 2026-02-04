-- Phase 14a: Lists & Curation

CREATE TABLE lists (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) > 0),
  description text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE list_items (
  id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id  uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  book_id  uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  added_at timestamptz DEFAULT now(),
  UNIQUE (list_id, book_id)
);

CREATE INDEX idx_list_items_list_id ON list_items (list_id);
CREATE INDEX idx_list_items_book_id ON list_items (book_id);
CREATE INDEX idx_list_items_position ON list_items (list_id, position);
CREATE INDEX idx_lists_created_at ON lists (created_at DESC);

CREATE TRIGGER set_lists_updated_at
  BEFORE UPDATE ON lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON lists FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON lists FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON lists FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous deletes" ON lists FOR DELETE USING (true);

ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON list_items FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON list_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON list_items FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous deletes" ON list_items FOR DELETE USING (true);
