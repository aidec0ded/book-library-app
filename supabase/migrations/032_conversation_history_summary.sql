-- Condensed history for long conversations (server/conversation-history.ts).
-- Once a conversation's history passes about 20,000 tokens, everything but the most
-- recent part is condensed into history_summary, and the AI is sent the summary plus
-- the messages after history_summarized_until. The reader still sees every message.
-- Separate from conversations.summary, the one-line description from the review step.

alter table public.conversations
  add column history_summary text,
  add column history_summarized_until timestamptz;
