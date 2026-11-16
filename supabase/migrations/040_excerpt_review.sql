-- Excerpts the reader deletes are kept, hidden, so the review step can see what they removed
-- and not save it (or something like it) again when a conversation is resumed and reviewed
-- once more. Every read of book_excerpts filters on deleted_at. Deleting the book or the
-- account still removes them for good.
--
-- General conversations (not started from a book page) are now reviewed too, so a message in
-- any conversation but onboarding marks it for review. The review only spends a call on one
-- that names books in the reader's library.

ALTER TABLE book_excerpts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at,
      needs_review = NOT is_onboarding
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;
