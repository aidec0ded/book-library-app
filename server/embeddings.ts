import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordJobRun, recordUsage, VOYAGE_PRICE_PER_MTOK } from "./usage.js";

/**
 * Embeddings for searching the library by meaning, from Voyage AI (through MongoDB
 * Atlas, where the key was created). Books are embedded from their title, author,
 * genre, and summary; each distinct text is embedded once and shared between
 * libraries (see migration 031). Vectors are normalized, so cosine distance ranks.
 */

export const EMBEDDING_MODEL = "voyage-4";
export const EMBEDDING_DIMENSIONS = 1024;

const BATCH_SIZE = 128; // texts per request, as Voyage recommends
const BATCH_TOKENS = 100_000; // rough cap per request (4 characters a token), well under voyage-4's 320K
const MAX_SUMMARY_CHARS = 6000;
const QUERY_CACHE_SIZE = 200;

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.VOYAGE_AI_API_KEY);
}

function endpoint(): string {
  const configured = (process.env.VOYAGE_AI_ENDPOINT ?? "ai.mongodb.com").trim().replace(/\/+$/, "");
  const base = /^https?:\/\//.test(configured) ? configured : `https://${configured}`;
  return base.endsWith("/embeddings") ? base : `${base.replace(/\/v1$/, "")}/v1/embeddings`;
}

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  usage: { total_tokens: number };
}

/** Embeds texts in order, retrying rate limits and server errors. */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
): Promise<{ embeddings: number[][]; tokens: number }> {
  const key = process.env.VOYAGE_AI_API_KEY;
  if (!key) throw new Error("Search by meaning isn't set up (VOYAGE_AI_API_KEY is missing).");

  // Batches by count and by rough size, so long summaries can't push a request past a limit
  const batches: string[][] = [];
  let current: string[] = [];
  let currentTokens = 0;
  for (const text of texts) {
    const estimate = Math.ceil(text.length / 4);
    if (current.length > 0 && (current.length >= BATCH_SIZE || currentTokens + estimate > BATCH_TOKENS)) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(text);
    currentTokens += estimate;
  }
  if (current.length > 0) batches.push(current);

  const embeddings: number[][] = [];
  let tokens = 0;
  for (const batch of batches) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(endpoint(), {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          input: batch,
          model: EMBEDDING_MODEL,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const body = (await res.json()) as VoyageResponse;
        const ordered = [...body.data].sort((a, b) => a.index - b.index);
        embeddings.push(...ordered.map((d) => d.embedding));
        const batchTokens = body.usage?.total_tokens ?? 0;
        tokens += batchTokens;
        await recordUsage({
          provider: "voyage",
          feature: inputType === "query" ? "search_by_meaning" : "book_embeddings",
          model: EMBEDDING_MODEL,
          inputTokens: batchTokens,
          costUsd: (batchTokens * VOYAGE_PRICE_PER_MTOK) / 1e6,
        });
        break;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 4) {
        const detail = (await res.text()).slice(0, 300);
        throw new Error(`Embedding request failed (${res.status}): ${detail}`);
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
  return { embeddings, tokens };
}

const queryCache = new Map<string, number[]>();

/** One search query as a vector. Recent queries are kept, since the AI often repeats them. */
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();
  const cached = queryCache.get(key);
  if (cached) return cached;
  const { embeddings } = await embedTexts([text.trim()], "query");
  queryCache.set(key, embeddings[0]);
  if (queryCache.size > QUERY_CACHE_SIZE) queryCache.delete(queryCache.keys().next().value!);
  return embeddings[0];
}

/** A vector as Postgres reads it ('[0.1,0.2,…]'). */
export function toPgVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export interface EmbeddableBook {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  genre: string | null;
  book_type: string | null;
  summary: string | null;
}

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/([a-z][.!?])([A-Z])/g, "$1 $2") // ISBNdb drops paragraph breaks: "AI.Henry"
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** The text a book is embedded from. Only what's the same in every library, so it can be shared. */
export function bookEmbeddingText(book: EmbeddableBook): string {
  const title = book.subtitle ? `${book.title}: ${book.subtitle}` : book.title;
  const lines = [title];
  if (book.author) lines.push(`by ${book.author}`);
  const kind = [book.book_type ?? "fiction", book.genre].filter(Boolean).join(", ");
  lines.push(kind);
  const summary = book.summary ? plainText(book.summary).slice(0, MAX_SUMMARY_CHARS) : "";
  if (summary) lines.push("", summary);
  return lines.join("\n");
}

export function contentHash(text: string): string {
  return createHash("sha256").update(`${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}\n${text}`).digest("hex");
}

/** Books with no embedding for their current text. Service-role client: every reader's books. */
export async function countPendingBooks(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("books")
    .select("id, book_embeddings!left(book_id)", { count: "exact", head: true })
    .is("book_embeddings", null);
  if (error) throw error;
  return count ?? 0;
}

export interface EmbedRunResult {
  books: number;
  newTexts: number;
  reusedTexts: number;
  tokens: number;
}

/**
 * Embeds up to `limit` books that have no embedding for their current text. Texts
 * already embedded (the same book in another library) are reused without a call.
 */
export async function embedPendingBooks(
  supabase: SupabaseClient,
  { limit = 500 }: { limit?: number } = {},
): Promise<EmbedRunResult> {
  const { data, error } = await supabase
    .from("books")
    .select("id, user_id, title, subtitle, author, genre, book_type, summary, book_embeddings!left(book_id)")
    .is("book_embeddings", null)
    .order("created_at")
    .limit(limit);
  if (error) throw error;
  const books = (data ?? []) as unknown as EmbeddableBook[];
  if (books.length === 0) return { books: 0, newTexts: 0, reusedTexts: 0, tokens: 0 };

  const prepared = books.map((book) => {
    const text = bookEmbeddingText(book);
    return { book, text, hash: contentHash(text) };
  });

  // Which texts are already embedded
  const uniqueHashes = [...new Set(prepared.map((p) => p.hash))];
  const existing = new Set<string>();
  for (let i = 0; i < uniqueHashes.length; i += 100) {
    const { data: rows, error: lookupError } = await supabase
      .from("text_embeddings")
      .select("content_hash")
      .in("content_hash", uniqueHashes.slice(i, i + 100));
    if (lookupError) throw lookupError;
    for (const row of rows ?? []) existing.add(row.content_hash as string);
  }

  const toEmbed = new Map<string, string>();
  for (const p of prepared) if (!existing.has(p.hash)) toEmbed.set(p.hash, p.text);

  let tokens = 0;
  if (toEmbed.size > 0) {
    const hashes = [...toEmbed.keys()];
    const result = await embedTexts([...toEmbed.values()], "document");
    tokens = result.tokens;
    const rows = hashes.map((hash, i) => ({
      content_hash: hash,
      embedding: toPgVector(result.embeddings[i]),
      model: EMBEDDING_MODEL,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error: insertError } = await supabase
        .from("text_embeddings")
        .upsert(rows.slice(i, i + 100), { onConflict: "content_hash", ignoreDuplicates: true });
      if (insertError) throw insertError;
    }
  }

  const links = prepared.map((p) => ({ book_id: p.book.id, user_id: p.book.user_id, content_hash: p.hash }));
  for (let i = 0; i < links.length; i += 200) {
    const { error: linkError } = await supabase
      .from("book_embeddings")
      .upsert(links.slice(i, i + 200), { onConflict: "book_id" });
    if (linkError) throw linkError;
  }

  return {
    books: books.length,
    newTexts: toEmbed.size,
    reusedTexts: uniqueHashes.length - toEmbed.size,
    tokens,
  };
}

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const STARTUP_DELAY_MS = 90 * 1000;
const MAX_BATCHES_PER_CHECK = 10;
let running = false;

/** Embeds new and changed books every 10 minutes. Does nothing without a Voyage key. */
export function startEmbeddingScheduler(supabase: SupabaseClient): void {
  if (!embeddingsConfigured()) {
    console.log("[embeddings] VOYAGE_AI_API_KEY not set; search by meaning is off.");
    return;
  }
  const check = async () => {
    if (running) return;
    running = true;
    try {
      let total: EmbedRunResult = { books: 0, newTexts: 0, reusedTexts: 0, tokens: 0 };
      for (let i = 0; i < MAX_BATCHES_PER_CHECK; i++) {
        const r = await embedPendingBooks(supabase);
        total = {
          books: total.books + r.books,
          newTexts: total.newTexts + r.newTexts,
          reusedTexts: total.reusedTexts + r.reusedTexts,
          tokens: total.tokens + r.tokens,
        };
        if (r.books < 500) break;
      }
      if (total.books > 0) {
        console.log(
          `[embeddings] Embedded ${total.books} books: ${total.newTexts} new texts, ${total.reusedTexts} reused, ${total.tokens} tokens.`,
        );
      }
      await recordJobRun("embeddings", { ok: true });
    } catch (err) {
      console.error("[embeddings] Check failed:", err instanceof Error ? err.message : err);
      await recordJobRun("embeddings", { ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };
  setTimeout(() => {
    void check();
    setInterval(() => void check(), CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
