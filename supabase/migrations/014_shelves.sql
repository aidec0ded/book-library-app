-- Phase 19+20: Visual Bookshelf with Customizable Shelves

CREATE TABLE shelves (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) > 0),
  description text,
  shelf_type  text NOT NULL DEFAULT 'manual' CHECK (shelf_type IN ('manual', 'auto')),
  filter      jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE shelf_items (
  id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shelf_id uuid NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  book_id  uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  added_at timestamptz DEFAULT now(),
  UNIQUE (shelf_id, book_id)
);

CREATE INDEX idx_shelf_items_shelf_id ON shelf_items (shelf_id);
CREATE INDEX idx_shelf_items_book_id ON shelf_items (book_id);
CREATE INDEX idx_shelf_items_position ON shelf_items (shelf_id, position);
CREATE INDEX idx_shelves_created_at ON shelves (created_at DESC);

-- Reuse existing trigger function from migration 001
CREATE TRIGGER set_shelves_updated_at
  BEFORE UPDATE ON shelves
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (same anonymous-access pattern as all other tables)
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON shelves FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON shelves FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON shelves FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous deletes" ON shelves FOR DELETE USING (true);

ALTER TABLE shelf_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON shelf_items FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON shelf_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON shelf_items FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous deletes" ON shelf_items FOR DELETE USING (true);
