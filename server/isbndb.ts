import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ISBNdbBook } from "../src/lib/editions.js";
import { recordUsage } from "./usage.js";

/**
 * Every ISBNdb call goes through here: the server's Add Book proxy and chat lookups,
 * and the enrichment, ISBN discovery, and release scripts.
 *
 * The plan allows 5,000 calls a day (reset at midnight UTC) and 60 a minute. A lookup
 * is charged per ISBN, bulk or not; a search is one call however many books it
 * returns. So:
 * - Every book ISBNdb returns is cached by ISBN (isbndb_books, migration 033), and
 *   lookups check the cache, then ingested releases, before calling.
 * - Lookups that miss go out 100 ISBNs to a call, which is fast but costs the same.
 * - Each response reports what's left of the day. The latest figure is kept in
 *   api_quota, shared by every process, and background work stops when only
 *   BACKGROUND_RESERVE calls are left, so Add Book and chat keep working.
 */

export const ISBNDB_BASE_URL = "https://api2.isbndb.com";
export const BULK_SIZE = 100;
/** Calls kept back each day for readers' own searches and the books the AI adds */
export const BACKGROUND_RESERVE = 1000;

const MIN_GAP_MS = 150;
/** When fewer than this many calls are left in the current minute, wait for it to roll over */
const RATE_FLOOR = 5;
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
/** A book ISBNdb didn't have is looked up again after this long */
const NOT_FOUND_RETRY_DAYS = 90;

let service: SupabaseClient | null = null;
/** Service-role client: the cache and quota tables have no reader access. */
function db(): SupabaseClient {
  service ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  return service;
}

export const normalizeIsbn = (isbn: string) => isbn.replace(/[-\s]/g, "").toUpperCase();

/** The ISBN-13 form of an ISBN-10 (978 prefix and a new check digit). */
export function isbn10to13(isbn10: string): string | null {
  if (!/^\d{9}[\dX]$/.test(isbn10)) return null;
  const core = `978${isbn10.slice(0, 9)}`;
  const sum = [...core].reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

// --- Requests ---

let lastRequest: Promise<unknown> = Promise.resolve();
/** The per-minute allowance ISBNdb last reported ("rate";r=58;t=0): calls left, and seconds until more */
let rateLeft = Infinity;
let rateResetsAt = 0;

/**
 * One request at a time per process. ISBNdb allows 60 a minute and says how many are
 * left, so requests go straight through until that runs low, then wait for the reset.
 */
function paced<T>(request: () => Promise<T>): Promise<T> {
  const result = lastRequest.then(async () => {
    if (rateLeft < RATE_FLOOR) {
      const wait = Math.max(1000, rateResetsAt - Date.now());
      await new Promise((r) => setTimeout(r, wait));
    }
    return request();
  });
  lastRequest = result.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, MIN_GAP_MS)));
  return result;
}

function recordRate(header: string | null): void {
  const match = header?.match(/"rate";r=(\d+);t=(\d+)/);
  if (!match) return;
  rateLeft = Number(match[1]);
  rateResetsAt = Date.now() + Number(match[2]) * 1000;
}

/**
 * Record what ISBNdb says is left of the day. Its header gives the count from before
 * the current request's charge ("daily";r=4994;t=75700), so the charge is subtracted.
 */
function recordQuota(header: string | null, charged: number): void {
  const match = header?.match(/"daily";r=(\d+);t=(\d+)/);
  if (!match) return;
  const remaining = Math.max(0, Number(match[1]) - charged);
  const resetsAt = new Date(Date.now() + Number(match[2]) * 1000).toISOString();
  void db()
    .from("api_quota")
    .upsert({ service: "isbndb", remaining, resets_at: resetsAt, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error("[isbndb] Couldn't record quota:", error.message);
    });
}

/**
 * A paced ISBNdb request, retried on rate limits and server errors. `cost` is what the
 * request is charged against the daily quota: 1, or the number of ISBNs in a bulk lookup.
 */
export async function isbndbFetch(
  path: string,
  options: { method?: "GET" | "POST"; body?: string; cost?: number } = {},
): Promise<Response> {
  const key = process.env.ISBNDB_API_KEY;
  if (!key) throw new Error("ISBNDB_API_KEY is not set");
  for (let attempt = 1; ; attempt++) {
    const res = await paced(() =>
      fetch(`${ISBNDB_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
          Authorization: key,
          ...(options.body && { "Content-Type": "application/x-www-form-urlencoded" }),
        },
        body: options.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
    recordRate(res.headers.get("ratelimit"));
    const charged = res.ok || res.status === 404 ? (options.cost ?? 1) : 0;
    recordQuota(res.headers.get("ratelimit"), charged);
    if (charged > 0) {
      // The plan is a flat monthly fee, so calls are counted rather than priced
      void recordUsage({
        provider: "isbndb",
        feature: path.startsWith("/books?") || options.method === "POST" || path.startsWith("/book/") ? "isbndb_lookup" : "isbndb_search",
        calls: charged,
      });
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    return res;
  }
}

// --- Quota ---

/** What's left of today's ISBNdb quota, or null when unknown (no call yet today). */
export async function quotaRemaining(): Promise<number | null> {
  const { data, error } = await db().from("api_quota").select("remaining, resets_at").eq("service", "isbndb").maybeSingle();
  if (error || !data) return null;
  if (new Date(data.resets_at as string).getTime() <= Date.now()) return null; // a new day
  return data.remaining as number;
}

/** How many calls background work may still make today, leaving the reserve. */
export async function backgroundBudget(): Promise<number> {
  const remaining = await quotaRemaining();
  return remaining === null ? Infinity : Math.max(0, remaining - BACKGROUND_RESERVE);
}

// --- Cache ---

/** Keep books ISBNdb returned. Best-effort: a failed write only costs a future call. */
export async function cacheBooks(books: ISBNdbBook[]): Promise<void> {
  const rows = new Map<string, { isbn: string; isbn10: string | null; data: ISBNdbBook; fetched_at: string }>();
  const now = new Date().toISOString();
  for (const book of books) {
    const isbn13 = book.isbn13 ? normalizeIsbn(book.isbn13) : null;
    const isbn10 = book.isbn ? normalizeIsbn(book.isbn) : null;
    const key = isbn13 ?? isbn10;
    if (key) rows.set(key, { isbn: key, isbn10: isbn10 && isbn10.length === 10 ? isbn10 : null, data: book, fetched_at: now });
  }
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await db().from("isbndb_books").upsert(list.slice(i, i + 500), { onConflict: "isbn" });
    if (error) console.error("[isbndb] Couldn't cache books:", error.message);
  }
}

async function cacheNotFound(isbns: string[]): Promise<void> {
  if (isbns.length === 0) return;
  const now = new Date().toISOString();
  const rows = isbns.map((isbn) => ({ isbn, isbn10: null, data: null, fetched_at: now }));
  const { error } = await db().from("isbndb_books").upsert(rows, { onConflict: "isbn" });
  if (error) console.error("[isbndb] Couldn't record books not found:", error.message);
}

function releaseAsBook(r: Record<string, unknown>): ISBNdbBook {
  const book: ISBNdbBook = { title: r.title as string };
  if (r.isbn13) book.isbn13 = r.isbn13 as string;
  if (r.isbn10) book.isbn = r.isbn10 as string;
  if (r.authors) book.authors = r.authors as string[];
  if (r.publisher) book.publisher = r.publisher as string;
  if (r.date_published) book.date_published = r.date_published as string;
  if (r.binding) book.binding = r.binding as string;
  if (r.page_count) book.pages = r.page_count as number;
  if (r.cover_image_url) book.image = r.cover_image_url as string;
  if (r.synopsis) book.synopsis = r.synopsis as string;
  if (r.subjects) book.subjects = r.subjects as string[];
  if (r.language) book.language = r.language as string;
  if (r.edition) book.edition = r.edition as string;
  return book;
}

/**
 * What's already known about these ISBNs, without calling ISBNdb: the cache, then
 * ingested releases. A value of null means ISBNdb was asked recently and didn't have it.
 */
export async function cachedLookup(isbns: string[]): Promise<Map<string, ISBNdbBook | null>> {
  const known = new Map<string, ISBNdbBook | null>();
  const wanted = [...new Set(isbns.map(normalizeIsbn))];
  const notFoundCutoff = Date.now() - NOT_FOUND_RETRY_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 0; i < wanted.length; i += 200) {
    const chunk = wanted.slice(i, i + 200);
    const tens = chunk.filter((isbn) => isbn.length === 10);
    const [byIsbn, byTen] = await Promise.all([
      db().from("isbndb_books").select("isbn, isbn10, data, fetched_at").in("isbn", chunk),
      tens.length > 0
        ? db().from("isbndb_books").select("isbn, isbn10, data, fetched_at").in("isbn10", tens)
        : Promise.resolve({ data: [], error: null }),
    ]);
    // Without the cache table (before migration 033), carry on as if nothing is cached
    const cacheError = byIsbn.error ?? byTen.error;
    if (cacheError) {
      console.error("[isbndb] Couldn't read the cache:", cacheError.message);
      break;
    }
    for (const row of [...(byIsbn.data ?? []), ...(byTen.data ?? [])]) {
      if (row.data === null && new Date(row.fetched_at as string).getTime() < notFoundCutoff) continue;
      const requested = chunk.includes(row.isbn as string) ? (row.isbn as string) : (row.isbn10 as string);
      known.set(requested, row.data as ISBNdbBook | null);
    }
  }

  // Releases already ingested, by ISBN-13 (the indexed column; ISBN-10s are converted)
  const asked13 = new Map<string, string>();
  for (const isbn of wanted.filter((i) => !known.has(i))) {
    const isbn13 = isbn.length === 13 ? isbn : isbn10to13(isbn);
    if (isbn13) asked13.set(isbn13, isbn);
  }
  const misses13 = [...asked13.keys()];
  for (let i = 0; i < misses13.length; i += 200) {
    const chunk = misses13.slice(i, i + 200);
    const fields = "title, isbn13, isbn10, authors, publisher, date_published, binding, page_count, cover_image_url, synopsis, subjects, language, edition";
    const { data, error } = await db().from("new_releases").select(fields).in("isbn13", chunk);
    if (error) {
      console.error("[isbndb] Couldn't read releases:", error.message);
      break;
    }
    for (const r of data ?? []) known.set(asked13.get(r.isbn13 as string)!, releaseAsBook(r));
  }
  return known;
}

export interface LookupResult {
  /** Books found, by the ISBN as asked for */
  found: Map<string, ISBNdbBook>;
  /** ISBNs ISBNdb doesn't have */
  notFound: string[];
  /** ISBNs not looked up because background work has used its share of today's quota */
  deferred: string[];
  /** Calls charged against the daily quota */
  charged: number;
}

/**
 * Look up books by ISBN: from the cache where possible, the rest from ISBNdb 100 to a
 * call. With `background`, stops at the background budget and returns the rest as
 * deferred, to try after the quota resets.
 */
export async function lookupIsbns(isbns: string[], { background = false } = {}): Promise<LookupResult> {
  const wanted = [...new Set(isbns.map(normalizeIsbn))].filter((i) => /^(\d{9}[\dX]|\d{13})$/.test(i));
  const result: LookupResult = { found: new Map(), notFound: [], deferred: [], charged: 0 };
  const known = await cachedLookup(wanted);
  for (const [isbn, book] of known) {
    if (book) result.found.set(isbn, book);
    else result.notFound.push(isbn);
  }

  const misses = wanted.filter((isbn) => !known.has(isbn));
  const budget = background ? await backgroundBudget() : Infinity;
  const toFetch = misses.slice(0, Math.min(misses.length, budget));
  result.deferred = misses.slice(toFetch.length);

  for (let i = 0; i < toFetch.length; i += BULK_SIZE) {
    const chunk = toFetch.slice(i, i + BULK_SIZE);
    const res = await isbndbFetch("/books", { method: "POST", body: `isbns=${chunk.join(",")}`, cost: chunk.length });
    if (!res.ok) throw new Error(`ISBNdb bulk lookup failed: HTTP ${res.status}`);
    result.charged += chunk.length;
    const body = (await res.json()) as { data?: ISBNdbBook[] };
    const books = body.data ?? [];
    await cacheBooks(books);
    const byIsbn = new Map<string, ISBNdbBook>();
    for (const book of books) {
      if (book.isbn13) byIsbn.set(normalizeIsbn(book.isbn13), book);
      if (book.isbn) byIsbn.set(normalizeIsbn(book.isbn), book);
    }
    const missing: string[] = [];
    for (const isbn of chunk) {
      const book = byIsbn.get(isbn);
      if (book) result.found.set(isbn, book);
      else missing.push(isbn);
    }
    result.notFound.push(...missing);
    await cacheNotFound(missing);
  }
  return result;
}

/**
 * An ISBNdb search (any /books/..., /author/..., or /publisher/... path). One call
 * however many books come back, and every book is cached. Returns the parsed body,
 * or null when ISBNdb found nothing.
 */
export async function isbndbSearch(path: string): Promise<{ total?: number; books?: ISBNdbBook[] } | null> {
  const res = await isbndbFetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ISBNdb HTTP ${res.status}`);
  const body = (await res.json()) as { total?: number; books?: ISBNdbBook[] };
  if (body.books?.length) await cacheBooks(body.books);
  return body;
}
