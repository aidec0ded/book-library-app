-- Phase 11: AI Reading Companion — conversations, messages, memory_files

-- Conversations table
CREATE TABLE conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at  timestamptz DEFAULT now(),
  title       text,
  archived_at timestamptz
);

-- Messages table
CREATE TABLE messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  created_at      timestamptz DEFAULT now()
);

-- Memory files table (for Claude memory tool persistence)
CREATE TABLE memory_files (
  path       text PRIMARY KEY,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_created_at ON messages (created_at);
CREATE INDEX idx_conversations_started_at ON conversations (started_at);

-- Reuse existing update_updated_at_column() trigger for memory_files
CREATE TRIGGER set_memory_files_updated_at
  BEFORE UPDATE ON memory_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON conversations FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON conversations FOR UPDATE USING (true);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON messages FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON messages FOR INSERT WITH CHECK (true);

ALTER TABLE memory_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON memory_files FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON memory_files FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON memory_files FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous deletes" ON memory_files FOR DELETE USING (true);
