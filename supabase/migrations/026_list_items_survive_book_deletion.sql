-- Removing a book from the library no longer removes it from syllabi and reading
-- paths. The list item keeps its focus questions, rationale, position, and progress,
-- and becomes an external item: the book's details are copied onto it, the same shape
-- as an item that was never in the library. Removing from a list stays a separate action.

-- Runs before the delete, so external_title is set by the time the foreign key clears
-- book_id (list_items_has_book_or_title requires one or the other).
CREATE OR REPLACE FUNCTION preserve_list_items_on_book_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- An external item for this same book would collide with list_items_external_unique.
  -- Keep the item being converted, since it's the one attached to the book.
  DELETE FROM list_items AS external
  USING list_items AS linked
  WHERE linked.book_id = OLD.id
    AND external.list_id = linked.list_id
    AND external.book_id IS NULL
    AND external.external_title = OLD.title
    AND external.external_author IS NOT DISTINCT FROM OLD.author;

  UPDATE list_items
  SET external_title = OLD.title,
      external_author = OLD.author,
      external_cover_url = OLD.cover_image_url,
      external_isbn = OLD.isbn
  WHERE book_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS preserve_list_items_before_book_delete ON books;
CREATE TRIGGER preserve_list_items_before_book_delete
  BEFORE DELETE ON books
  FOR EACH ROW
  EXECUTE FUNCTION preserve_list_items_on_book_delete();

ALTER TABLE list_items DROP CONSTRAINT IF EXISTS list_items_book_id_fkey;
ALTER TABLE list_items
  ADD CONSTRAINT list_items_book_id_fkey
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL;
