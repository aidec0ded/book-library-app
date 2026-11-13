-- A short record of what the companion did with its tools in a reply (server/action-log.ts):
-- [{"tool": "manage_book", "action": "update_status", "result": "Updated 'Dune' status ...", "failed": true?}]
-- Sent back to the AI with the reply in later turns, so it knows what it already did.
-- Null for replies that used no tools that change anything. Readers can read their own
-- rows through the existing messages policies.
alter table public.messages add column if not exists actions jsonb;
