-- Migration 020: Add user_id columns for multi-user auth
-- Run in Supabase SQL Editor

-- 1. Add user_id columns to all user-scoped tables
-- (DEFAULT auth.uid() means new rows auto-get the current user's ID)

ALTER TABLE books
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE book_vibes
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE conversations
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE messages
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE reader_profile
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE book_excerpts
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE lists
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE list_items
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE shelves
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE shelf_items
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 2. Fix memory_files: add proper PK and user_id
-- Currently uses path as PK — two users could have same path

ALTER TABLE memory_files
  ADD COLUMN id uuid DEFAULT gen_random_uuid();

ALTER TABLE memory_files
  DROP CONSTRAINT memory_files_pkey;

ALTER TABLE memory_files
  ADD PRIMARY KEY (id);

ALTER TABLE memory_files
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- Add unique constraint on (user_id, path) after user_id is populated
-- (done after SET NOT NULL below)

-- 3. Truncate user-scoped tables (fresh start — order matters for FKs)

TRUNCATE shelf_items CASCADE;
TRUNCATE shelves CASCADE;
TRUNCATE list_items CASCADE;
TRUNCATE lists CASCADE;
TRUNCATE book_excerpts CASCADE;
TRUNCATE messages CASCADE;
TRUNCATE conversations CASCADE;
TRUNCATE memory_files CASCADE;
TRUNCATE reader_profile CASCADE;
TRUNCATE book_vibes CASCADE;
TRUNCATE books CASCADE;

-- 4. Set user_id NOT NULL now that tables are empty

ALTER TABLE books ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE book_vibes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE memory_files ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE reader_profile ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE book_excerpts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE lists ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE list_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE shelves ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE shelf_items ALTER COLUMN user_id SET NOT NULL;

-- 5. Add unique constraint for memory_files (user_id, path)

ALTER TABLE memory_files
  ADD CONSTRAINT memory_files_user_path_unique UNIQUE (user_id, path);

-- 6. Add indexes on user_id

CREATE INDEX idx_books_user_id ON books (user_id);
CREATE INDEX idx_book_vibes_user_id ON book_vibes (user_id);
CREATE INDEX idx_conversations_user_id ON conversations (user_id);
CREATE INDEX idx_messages_user_id ON messages (user_id);
CREATE INDEX idx_memory_files_user_id ON memory_files (user_id);
CREATE INDEX idx_reader_profile_user_id ON reader_profile (user_id);
CREATE INDEX idx_book_excerpts_user_id ON book_excerpts (user_id);
CREATE INDEX idx_lists_user_id ON lists (user_id);
CREATE INDEX idx_list_items_user_id ON list_items (user_id);
CREATE INDEX idx_shelves_user_id ON shelves (user_id);
CREATE INDEX idx_shelf_items_user_id ON shelf_items (user_id);

-- 7. Create user_release_scores table (per-user release scoring/dismissals)

CREATE TABLE user_release_scores (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  release_id     uuid NOT NULL REFERENCES new_releases(id) ON DELETE CASCADE,
  personal_score numeric,
  ai_score       numeric,
  ai_rationale   text,
  dismissed      boolean NOT NULL DEFAULT false,
  scored_at      timestamptz,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, release_id)
);

CREATE INDEX idx_user_release_scores_user_id ON user_release_scores (user_id);
CREATE INDEX idx_user_release_scores_release_id ON user_release_scores (release_id);

ALTER TABLE user_release_scores ENABLE ROW LEVEL SECURITY;

-- 8. Drop per-user columns from new_releases

ALTER TABLE new_releases DROP COLUMN IF EXISTS personal_score;
ALTER TABLE new_releases DROP COLUMN IF EXISTS ai_score;
ALTER TABLE new_releases DROP COLUMN IF EXISTS ai_rationale;
ALTER TABLE new_releases DROP COLUMN IF EXISTS scored_at;
ALTER TABLE new_releases DROP COLUMN IF EXISTS dismissed;
