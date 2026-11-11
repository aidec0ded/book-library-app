/**
 * Embeds every book that has no embedding for its current text, for search by meaning.
 * The chat server does the same every 10 minutes; this is for the first fill and for
 * catching up by hand.
 *
 *   npx tsx scripts/embed-books.ts            # embed everything pending
 *   npx tsx scripts/embed-books.ts --dry-run  # count pending books and estimate tokens, no API calls
 *   npx tsx scripts/embed-books.ts --limit 50 # embed at most 50 books
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  bookEmbeddingText,
  countPendingBooks,
  embedPendingBooks,
  type EmbeddableBook,
} from "../server/embeddings.js";
config();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const pending = await countPendingBooks(supabase);
console.log(`${pending} books have no embedding for their current text.`);
if (pending === 0) process.exit(0);

if (dryRun) {
  const { data, error } = await supabase
    .from("books")
    .select("id, user_id, title, subtitle, author, genre, book_type, summary, book_embeddings!left(book_id)")
    .is("book_embeddings", null)
    .limit(Math.min(pending, Number.isFinite(limit) ? limit : 1000));
  if (error) throw error;
  const texts = (data as unknown as EmbeddableBook[]).map(bookEmbeddingText);
  const chars = texts.reduce((n, t) => n + t.length, 0);
  console.log(`First ${texts.length}: about ${Math.round(chars / 4).toLocaleString("en-US")} tokens before reuse.`);
  console.log(`\nExample:\n---\n${texts[0]}\n---`);
  process.exit(0);
}

let done = 0;
let tokens = 0;
let reused = 0;
while (done < limit) {
  const r = await embedPendingBooks(supabase, { limit: Math.min(500, limit - done) });
  if (r.books === 0) break;
  done += r.books;
  tokens += r.tokens;
  reused += r.reusedTexts;
  console.log(`Embedded ${done} books so far (${r.newTexts} new texts, ${r.reusedTexts} reused this batch).`);
  if (r.books < 500) break;
}
console.log(`Done: ${done} books, ${tokens.toLocaleString("en-US")} tokens, ${reused} texts reused.`);
