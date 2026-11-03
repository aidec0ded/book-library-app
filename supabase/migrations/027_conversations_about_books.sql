-- A conversation can be about a book. Starting one from a book page links them, so the
-- AI gets that book's context and the book page can list its conversations. Conversations
-- also track their latest activity, and a book-linked one is marked for review whenever
-- a message arrives, so what's worth keeping can be saved once the conversation goes quiet.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

UPDATE conversations AS c
SET last_message_at = COALESCE(
  (SELECT max(m.created_at) FROM messages AS m WHERE m.conversation_id = c.id),
  c.started_at,
  now()
);

CREATE INDEX IF NOT EXISTS conversations_user_activity_idx
  ON conversations (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS conversations_book_idx
  ON conversations (book_id, last_message_at DESC)
  WHERE book_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_needs_review_idx
  ON conversations (last_message_at)
  WHERE needs_review;

CREATE OR REPLACE FUNCTION touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      needs_review = (book_id IS NOT NULL)
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_conversation_after_message ON messages;
CREATE TRIGGER touch_conversation_after_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION touch_conversation_on_message();
