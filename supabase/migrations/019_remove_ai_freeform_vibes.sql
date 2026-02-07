-- Remove AI-generated freeform vibes (keep canonical + user-created)
DELETE FROM book_vibes
WHERE ai_assigned = true AND is_canonical = false;
