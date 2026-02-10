-- Add list_type discriminator
ALTER TABLE lists
  ADD COLUMN list_type text NOT NULL DEFAULT 'syllabus'
  CHECK (list_type IN ('syllabus', 'reading_path'));

-- Add thesis/framing for reading paths
ALTER TABLE lists
  ADD COLUMN thesis text;

-- Add seminar content and progress tracking to items
ALTER TABLE list_items
  ADD COLUMN seminar_content jsonb,
  ADD COLUMN path_progress text CHECK (path_progress IN ('not_started', 'reading', 'completed'));

-- Indexes
CREATE INDEX idx_lists_list_type ON lists (list_type);
CREATE INDEX idx_list_items_path_progress ON list_items (list_id, path_progress)
  WHERE path_progress IS NOT NULL;
