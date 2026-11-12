import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { authenticateRequest, type createUserClient } from "./auth.js";
import { buildLibraryIndex } from "./library-index.js";
import { executeLibrarySearch, type LibrarySearchCommand } from "./library-search.js";
import { loadReaderProfile } from "./profile-loader.js";
import { executeMemoryCommand, loadCoreMemory, MAX_MEMORY_CHARS, type MemoryCommand } from "./memory-handler.js";
import { executeSyllabusCommand, type SyllabusCommand } from "./syllabus-handler.js";
import {
  executeWishlistCommand,
  type WishlistCommand,
} from "./wishlist-handler.js";
import {
  executeExcerptCommand,
  type ExcerptCommand,
} from "./excerpt-handler.js";
import {
  executeBookCommand,
  type BookCommand,
} from "./book-handler.js";
import {
  executeReleasesCommand,
  type ReleasesCommand,
} from "./releases-handler.js";
import {
  executeReadingPathCommand,
  type ReadingPathCommand,
} from "./reading-path-handler.js";
import { buildSyllabusIndex, invalidateSyllabusIndex } from "./syllabus-index.js";
import { getGreeting } from "./greeting-handler.js";
import { isIsoDate } from "../src/lib/reading-dates.js";
import { buildBookContext, type LinkedBook } from "./book-context.js";
import { claimMessage, isPaidAndActive, releaseMessage } from "./subscription.js";
import { BodyTooLargeError, readJsonBody, readRawBody } from "./request-body.js";
import { clientIp, hit, rejectRateLimited, type RULES } from "./rate-limit.js";
import { condenseIfLong, historySummaryBlock, loadHistory } from "./conversation-history.js";
import { cacheBooks, isbndbFetch, lookupIsbns } from "./isbndb.js";
import type { ISBNdbBook } from "../src/lib/editions.js";
import { BUSY_MESSAGE, dailyBudgetReached, isCapacityError, recordSpend, type TokenUsage } from "./spend-guard.js";
import { requestReleasesCheck } from "./releases-scheduler.js";
import { jobsInWorker, startBackgroundJobs } from "./background-jobs.js";
import { CHAT_MODEL } from "./models.js";
import { buildOnboardingPrompt } from "./onboarding-prompt.js";
import {
  handleStripeWebhook,
  createCheckoutSession,
  createPortalSession,
} from "./stripe-handler.js";

config();

const MODEL = CHAT_MODEL;

async function logTokenUsage(
  supabase: ReturnType<typeof createUserClient>,
  userId: string,
  conversationId: string | null,
  endpoint: string,
  model: string,
  usage: TokenUsage,
): Promise<void> {
  recordSpend(model, usage);
  try {
    await supabase.from("chat_token_usage").insert({
      user_id: userId,
      conversation_id: conversationId,
      endpoint,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    });
  } catch {
    // Token logging is best-effort — never fail the request
  }
}
const PORT = parseInt(process.env.PORT || "3001", 10);

// Static file serving setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

// Service-role client — used ONLY for profile scheduler (server-side admin tasks)
const serviceSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Chat, greetings, and titles bill the chat workspace in the Anthropic Console;
// background work bills the jobs workspace, so each has its own spend limit
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
const jobsAnthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_JOBS_API_KEY ?? process.env.ANTHROPIC_API_KEY!,
});

/**
 * The chat prompt is sent as blocks ordered from least to most often changed, each
 * cached on its own, so a change to one only rewrites the cache from that block on:
 *
 * 1. Instructions (with the tools ahead of them). The same for every reader on a plan,
 *    so readers share one cache entry.
 * 2. The reader's profile and library. Changes monthly and when books change.
 * 3. Syllabi, memory, and the date. Change when the companion uses its tools.
 * 4. The conversation (cached automatically as it grows), after the book context.
 *
 * Blocks 1-3 use the 1-hour cache: readers often pause 5-60 minutes between messages
 * while reading, past the 5-minute cache. A 1-hour write costs 2x instead of 1.25x.
 */
const PROMPT_CACHE = { type: "ephemeral" as const, ttl: "1h" as const };

function buildInstructions(isPaid: boolean): string {
  const prompt = `You are the reading companion for Rekollekt, a personal book library app.
You are a sharp, well-read literary mind — think engaged seminar leader,
not enthusiastic assistant. You have genuine respect for the reader's taste,
but your job is to deepen their thinking, not validate their choices.

Your role:
- Discuss what the reader is currently reading and how it's affecting them
- Make connections between books in their library
- Explore why certain books resonate and others don't — push past surface reactions
- Help the reader reflect on their evolving tastes and reading life
- Challenge comfortable interpretations when you have a real literary reason to
- Remember what you learn about the reader

Voice and register:
- Be direct. State opinions. "I'd push back on that" is a perfectly good opener.
- Ask questions that complicate, not just affirm. If a reader says "I loved it,"
  explore what specifically worked and what that reveals about their sensibility.
- Use the vocabulary of literary criticism naturally — free indirect discourse,
  defamiliarization, negative capability — without explaining terms unless the
  reader seems unfamiliar. Assume intelligence.
- Brevity over effusion. One sharp observation beats three generous paragraphs.
- Reserve enthusiasm for moments that genuinely warrant it. No "Great question!"
  or "I love that you noticed..." on every response. When something is actually
  striking, your real engagement will land harder because it's earned.
- You can be warm — dry humor, genuine curiosity, the pleasure of a good
  literary argument — but never sycophantic.
- Do NOT narrate your tool use. Never say "Let me save that," "Let me add
  that to your library," "Let me record this," or "Let me check my memory."
  Just use your tools silently and continue the conversation naturally.

Your memory of this reader comes with your instructions, under "What you
remember about this reader", so you have it from the start of every
conversation without looking anything up. When you learn something that should
shape future conversations, record it with your update_memory tool: tastes and
aversions and what's behind them, corrections to something you assumed, context
about their reading life (a book club, a goal, a season of life), how they like
to talk about books. Remember the reader, not the conversation: don't keep a
log of what was discussed or of book statuses and ratings, which the library
already holds. Keep memory short and organized. Update or replace what's there
rather than adding near-duplicates, and remove what's no longer true.

You can create and manage curated syllabi using your manage_syllabi tool.
Create syllabi when the reader asks, or suggest them when you notice patterns
(e.g. "You've mentioned several cold, atmospheric novels — want me to
make a syllabus?"). Always confirm before creating proactively.
For library books, reference them by their exact title. You can also include
books not in the library — they'll be automatically added as wishlist items.
Always provide the author when recommending books not in the library.

Your instructions list the books the reader is reading, has read, rated, or
marked a favorite. Their unread books and wishlist aren't listed. Use your
search_library tool to find them: before saying the reader doesn't have a book,
when they ask what they own by an author or on a subject, and before recommending
something to read next, so you can suggest books they already own. When the
reader describes what they're in the mood for, search by meaning with "about"
(a mood, subject, or theme in plain words). When they want more like a book,
use "like_title". Tags and predicted ratings narrow and rank the candidates.

You can manage the reader's wishlist using your manage_wishlist tool.
When the reader mentions a book they want to read that isn't in their
library, offer to add it to their wishlist. You can also view and
remove books from the wishlist.

${
  isPaid
    ? `What's worth keeping from a conversation about a book is saved to that book's
page automatically after the conversation ends, so don't offer to save anything.
When the reader asks you to save something, use your save_excerpt tool right away:
a polished, self-contained 1-3 sentence version addressed to them as "you", keeping
their own words where you can.`
    : `The reader can save anything from this chat to a book's page using "Save to book"
under a message. If they ask you to save something, point them to that.`
}

You can update books in the library using your manage_book tool. When the
reader says they started, finished, or gave up on a book, update its status.
When they say when that happened ("I just finished it", "I started it last
week"), include the date. If they don't say, or it was a while ago, leave the
date out rather than guessing. When they rate a book, set the rating. You can
also mark/unmark favorites
and remove books from the library. Always confirm before deleting a book.
A deleted book stays on any syllabi and reading paths it's part of.

You can browse new releases using your search_releases tool. Use it to check
what books are coming out, find top recommendations, or search for specific
titles or authors in the releases pipeline.

You can create and manage reading paths using your manage_reading_paths tool.
Reading paths are structured intellectual journeys — deeper than syllabi, with
sequencing logic, pre-reading context, focus questions, and post-reading
reflection prompts. Create paths when the reader wants to explore a theme,
movement, or idea across multiple books. Each path has a thesis that frames
the journey. You can include books not in the library — they'll be automatically
added as wishlist items. Always provide the author when recommending books not
in the library. When discussing a book that belongs to an active reading path,
reference the path's thesis and the book's focus questions naturally. After
the reader finishes a book, offer to discuss using its post-reading prompts
and connect themes across books in the path. When starting a new book in the
path, share the pre-reading context naturally. Use get_seminar_content to
fetch full content when discussing specific books in a path.

The library contains three types of books — fiction, nonfiction, and poetry.
Each type has its own classification vocabulary:
- Fiction: vibes (e.g. atmospheric, cerebral, dark, intimate)
- Nonfiction: topics, form (e.g. narrative, analytical, polemic), depth (e.g. accessible, moderate, demanding)
- Poetry: movement (e.g. confessional, modernist), formal feel (e.g. lyric, prose-like), accessibility

Approach each type differently in conversation:
- For fiction, explore emotional resonance, atmosphere, narrative voice, and thematic connections
- For nonfiction, discuss the ideas and arguments, how the author's approach shapes understanding, and connections to the reader's intellectual interests
- For poetry, attend to language, form, emotional register, and how a poet's voice relates to movements or other poets the reader appreciates
- Draw cross-type connections when relevant — a novel's themes might connect to a nonfiction interest, or a poet's sensibility might illuminate a fiction preference`;

  return prompt;
}

function buildReaderContext(libraryIndex: string, readerProfile: string | null): string {
  const sections = [];
  if (readerProfile) sections.push(`## Reader Profile\n\n${readerProfile}`);
  sections.push(`## The Reader's Library\n\n${libraryIndex}`);
  return sections.join("\n\n");
}

interface ChatRequest {
  conversation_id: string | null;
  message: string;
  is_onboarding?: boolean;
  today?: string;
  book_id?: string;
}

function writeSSE(
  res: http.ServerResponse,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const ALLOWED_ORIGINS = new Set([
  "https://www.rekollekt.io",
  "https://rekollekt.io",
  "https://rekollekt.onrender.com",
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:5173"] : []),
]);

const FREE_MESSAGE_LIMIT = 5;
/** Fair-use cap on paid (and promotional) readers' chat replies a month: about $7.50 at today's cost per reply. */
const PAID_MONTHLY_REPLY_CAP = Number(process.env.PAID_MONTHLY_REPLY_CAP) || 100;
/** Onboarding chat is free of the monthly limits up to this many messages, then counts like any other chat. */
const ONBOARDING_MESSAGE_LIMIT = 20;
/** Longest chat message accepted: room for a pasted passage, not a whole chapter. */
const MAX_MESSAGE_CHARS = 10_000;

function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
}

interface SubscriptionRow {
  plan: string;
  status: string;
  chat_messages_used: number;
  chat_messages_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

/**
 * Get or create a user's subscription row.
 * Uses service role to ensure write access regardless of RLS.
 */
async function getOrCreateSubscription(userId: string): Promise<SubscriptionRow> {
  const { data } = await serviceSupabase
    .from("user_subscriptions")
    .select("plan, status, chat_messages_used, chat_messages_period_start, current_period_end, cancel_at_period_end, stripe_customer_id")
    .eq("user_id", userId)
    .single();

  if (data) {
    // Reset stale monthly counters
    const periodStart = new Date(data.chat_messages_period_start);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    if (periodStart < monthStart) {
      await serviceSupabase
        .from("user_subscriptions")
        .update({
          chat_messages_used: 0,
          chat_messages_period_start: monthStart.toISOString(),
        })
        .eq("user_id", userId)
        // A request sent at the same time may have already reset this and claimed a message
        .eq("chat_messages_period_start", data.chat_messages_period_start);
      data.chat_messages_used = 0;
      data.chat_messages_period_start = monthStart.toISOString();
    }
    return data as SubscriptionRow;
  }

  // Create default free subscription
  const { data: created } = await serviceSupabase
    .from("user_subscriptions")
    .insert({ user_id: userId, plan: "free", status: "active" })
    .select("plan, status, chat_messages_used, chat_messages_period_start, current_period_end, cancel_at_period_end, stripe_customer_id")
    .single();

  return created as SubscriptionRow;
}

/** Answer a request that failed unexpectedly. Left unhandled, it would take down the server. */
function failRequest(res: http.ServerResponse, label: string, err: unknown): void {
  console.error(`[${label}] Unexpected error:`, err instanceof Error ? err.message : err);
  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Something went wrong" }));
  } else {
    res.end();
  }
}

async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  // Auth: create per-request client
  let supabase;
  let userId: string;
  try {
    ({ supabase, userId } = await authenticateRequest(req.headers.authorization));
  } catch {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Per-reader limit, which can't be dodged by changing address
  const readerLimit = hit("chatPerReader", userId);
  if (!readerLimit.ok) {
    rejectRateLimited(res, readerLimit.retryAfter);
    return;
  }

  // Parse body
  let body: ChatRequest;
  try {
    body = (await readJsonBody(req)) as ChatRequest;
  } catch (err) {
    const tooLarge = err instanceof BodyTooLargeError;
    res.writeHead(tooLarge ? 413 : 400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: tooLarge ? "That message is too long." : "Invalid request body" }));
    return;
  }

  if (!body?.message || typeof body.message !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "message is required" }));
    return;
  }
  if (body.message.length > MAX_MESSAGE_CHARS) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "message_too_long",
      message: `That message is too long. Keep it under ${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters.`,
    }));
    return;
  }

  // Past the day's chat budget, answer "busy" before doing any work
  if (await dailyBudgetReached(serviceSupabase)) {
    setCorsHeaders(req, res);
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "busy", message: BUSY_MESSAGE }));
    return;
  }

  // Determine if this is an onboarding conversation
  let isOnboarding = false;

  if (body.conversation_id) {
    // Existing conversation — check its onboarding flag
    const { data: convRow } = await serviceSupabase
      .from("conversations")
      .select("is_onboarding")
      .eq("id", body.conversation_id)
      .single();
    if (convRow?.is_onboarding) {
      // Validate that onboarding is still in progress
      const { data: subRow } = await serviceSupabase
        .from("user_subscriptions")
        .select("onboarding_completed_at")
        .eq("user_id", userId)
        .single();
      isOnboarding = !subRow?.onboarding_completed_at;
    }
  } else if (body.is_onboarding) {
    // New conversation — validate that onboarding is not already complete
    const { data: subRow } = await serviceSupabase
      .from("user_subscriptions")
      .select("onboarding_completed_at")
      .eq("user_id", userId)
      .single();
    isOnboarding = !subRow?.onboarding_completed_at;
  }

  // Onboarding chat only skips the monthly limits for its first messages; otherwise an
  // account that never finished onboarding could chat for free indefinitely
  if (isOnboarding) {
    const { count: onboardingMessages } = await serviceSupabase
      .from("messages")
      .select("id, conversations!inner(user_id, is_onboarding)", { count: "exact", head: true })
      .eq("role", "user")
      .eq("conversations.user_id", userId)
      .eq("conversations.is_onboarding", true);
    if ((onboardingMessages ?? 0) >= ONBOARDING_MESSAGE_LIMIT) isOnboarding = false;
  }

  // Monthly limits: free readers' few messages, and a fair-use cap for paid readers.
  // A message is claimed before any work, so requests sent together can't pass the limit.
  const subscription = await getOrCreateSubscription(userId);
  const paid = isPaidAndActive(subscription);
  const claimsMessage = !isOnboarding;
  if (claimsMessage) {
    const limit = paid ? PAID_MONTHLY_REPLY_CAP : FREE_MESSAGE_LIMIT;
    const claimed = await claimMessage(serviceSupabase, userId, subscription.chat_messages_used, limit);
    if (!claimed) {
      setCorsHeaders(req, res);
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify(
        paid
          ? {
              error: "monthly_cap_reached",
              message: `You've had ${limit} replies from your companion this month, the most for one month. It'll be ready to talk again on the 1st.`,
            }
          : { error: "message_limit_reached", messages_used: limit, messages_limit: limit },
      ));
      return;
    }
  }

  let replySaved = false;

  // SSE headers
  setCorsHeaders(req, res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    // Create or reuse conversation
    // The server runs on UTC, so the reader's own date comes from the browser
    const today = isIsoDate(body.today) ? body.today : new Date().toISOString().slice(0, 10);

    let conversationId = body.conversation_id;
    let bookId: string | null = null;
    if (!conversationId) {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({
          ...(isOnboarding && { is_onboarding: true }),
          ...(!isOnboarding && body.book_id && { book_id: body.book_id }),
        })
        .select("id, book_id")
        .single();

      if (convError) throw convError;
      conversationId = conv.id as string;
      bookId = conv.book_id as string | null;
    } else {
      // Row-level security means this only finds the reader's own conversation
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("book_id")
        .eq("id", conversationId)
        .maybeSingle();

      if (convError) throw convError;
      if (!conv) throw new Error("This conversation no longer exists.");
      bookId = conv.book_id as string | null;
    }

    writeSSE(res, "meta", { conversation_id: conversationId });

    // Insert user message
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: body.message,
    });
    if (msgError) throw msgError;

    // Load conversation history: in full, or for a long conversation its condensed
    // start and the messages since (see conversation-history.ts)
    const history = await loadHistory(supabase, conversationId);

    const isPaid = isPaidAndActive(subscription);

    // The reader's memory, loaded while the prompt is built
    const coreMemoryPromise = loadCoreMemory(supabase);

    // System prompt blocks, cached separately (see PROMPT_CACHE). Onboarding uses its
    // own prompt with the 5-minute cache: its exchanges come in quick succession.
    const systemBlocks: Anthropic.Beta.Messages.BetaTextBlockParam[] = [];
    const dateLine = `Today's date is ${today}.`;
    if (isOnboarding) {
      // Onboarding lists every book: the AI is getting to know an imported library
      const libraryIndex = await buildLibraryIndex(supabase, userId, { full: true });
      // Count books for prompt branch selection
      const { count: libraryCount } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true });
      const coreMemory = await coreMemoryPromise;
      systemBlocks.push(
        { type: "text", text: buildOnboardingPrompt(libraryIndex, libraryCount ?? 0), cache_control: { type: "ephemeral" } },
        { type: "text", text: `${coreMemory}\n\n${dateLine}`, cache_control: { type: "ephemeral" } },
      );
    } else {
      const [libraryIndex, readerProfile, syllabusIndex, coreMemory] = await Promise.all([
        buildLibraryIndex(supabase, userId),
        loadReaderProfile(supabase, userId),
        buildSyllabusIndex(supabase, userId),
        coreMemoryPromise,
      ]);
      systemBlocks.push(
        { type: "text", text: buildInstructions(isPaid), cache_control: PROMPT_CACHE },
        { type: "text", text: buildReaderContext(libraryIndex, readerProfile), cache_control: PROMPT_CACHE },
        {
          type: "text",
          text: [syllabusIndex, coreMemory, dateLine].filter(Boolean).join("\n\n"),
          cache_control: PROMPT_CACHE,
        },
      );
    }

    // After the cached blocks, so conversations about other books still reuse them
    const bookContext = bookId ? await buildBookContext(supabase, bookId, conversationId) : null;
    const linkedBook: LinkedBook | null = bookContext?.book ?? null;
    if (bookContext) systemBlocks.push({ type: "text", text: bookContext.text });
    if (history.summary) systemBlocks.push({ type: "text", text: historySummaryBlock(history.summary) });

    // Build API messages from history
    const apiMessages: Anthropic.Beta.Messages.BetaMessageParam[] =
      history.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      }));

    // Build tool list — free users get a subset
    const chatTools: Anthropic.Beta.Messages.BetaToolUnion[] = [
      {
        name: "update_memory",
        description:
          `Change your memory of this reader, which comes with your instructions in every conversation. Use one file, /memories/reader.md, unless a topic has grown big enough for its own file. Commands: create writes a whole file (replacing it if it exists); append adds text to the end of a file; str_replace replaces text that appears exactly once in a file; delete removes a file. Memory holds at most ${MAX_MEMORY_CHARS.toLocaleString("en-US")} characters across all files, so condense rather than pile up.`,
        input_schema: {
          type: "object" as const,
          properties: {
            command: {
              type: "string",
              enum: ["create", "append", "str_replace", "delete"],
            },
            path: {
              type: "string",
              description: "File path under /memories/, such as /memories/reader.md",
            },
            file_text: {
              type: "string",
              description: "The file's full text (create) or the text to add (append)",
            },
            old_str: {
              type: "string",
              description: "Text to replace, matching exactly once (str_replace)",
            },
            new_str: {
              type: "string",
              description: "Replacement text (str_replace)",
            },
          },
          required: ["command", "path"],
        },
      },
      {
            name: "manage_syllabi",
            description:
              "Create and manage curated syllabi (themed reading collections). Books don't need to be in the library already — any book not found will be automatically added as a wishlist item. Use this to build themed syllabi, reading recommendations, or collections based on conversation context. Edit a syllabus in place with reorder, update_rationale, and update_syllabus rather than removing and re-adding books. Removing a book deletes its rationale, so only remove a book or delete a syllabus when the reader asks. Books stay in the library either way.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "create",
                    "view",
                    "add_books",
                    "remove_books",
                    "delete",
                    "reorder",
                    "update_rationale",
                    "update_syllabus",
                  ],
                  description: "The action to perform",
                },
                list_name: {
                  type: "string",
                  description:
                    "Name of the syllabus (required for all actions except view-all)",
                },
                description: {
                  type: "string",
                  description: "Syllabus description (used with create and update_syllabus)",
                },
                books: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description:
                          "Book title (use exact library title if the book is in the library)",
                      },
                      author: {
                        type: "string",
                        description:
                          "Book author (important for books not yet in the library)",
                      },
                    },
                    required: ["title"],
                  },
                  description:
                    "Books to include. For library books, use the exact title. For any book, include the author.",
                },
                rationale: {
                  type: "string",
                  description:
                    "Brief explanation of why these books belong in the syllabus (used with create, add_books, and update_rationale; empty clears it)",
                },
                new_name: {
                  type: "string",
                  description: "New name for the syllabus (used with update_syllabus)",
                },
                book_title: {
                  type: "string",
                  description: "Book to act on (used with update_rationale, and with reorder to move one book)",
                },
                ordered_titles: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "New order of books (used with reorder). Books left out keep their relative order after those named.",
                },
                position: {
                  type: "number",
                  description:
                    "1-based position (used with reorder to move book_title, and with add_books to insert there instead of at the end)",
                },
              },
              required: ["action"],
            },
          },
          {
            name: "manage_wishlist",
            description:
              "Add books to or manage the reader's wishlist — books they want to read but don't own yet. Use when the reader expresses interest in a book not in their library, or asks about their wishlist.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: ["add", "view", "remove"],
                  description: "The action to perform",
                },
                title: {
                  type: "string",
                  description:
                    "Book title (required for add and remove)",
                },
                author: {
                  type: "string",
                  description:
                    "Book author (used with add for better records)",
                },
              },
              required: ["action"],
            },
          },
          {
            name: "save_excerpt",
            description:
              "Save an insight from the current conversation to a book's page when the reader asks you to, or view what's saved for a book. Don't use it unprompted: what's worth keeping is saved automatically after the conversation ends.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: ["save", "view"],
                  description:
                    "save to attach an excerpt, view to see existing excerpts",
                },
                book_title: {
                  type: "string",
                  description:
                    "Exact book title as shown in the library. Leave it out in a conversation about one book to use that book.",
                },
                content: {
                  type: "string",
                  description:
                    "Polished 1-3 sentence insight to save (required for save)",
                },
              },
              required: ["action"],
            },
          },
          {
            name: "manage_book",
            description:
              "Add a book to the library, or update a book's status, rating, or favorite flag, or remove it from the library. Use 'add' to add a new book (defaults to 'read' status). Use other actions when the reader says they started, finished, or gave up on a book, rates a book, marks a favorite, or wants to delete a book.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "add",
                    "update_status",
                    "update_rating",
                    "toggle_favorite",
                    "delete",
                  ],
                  description: "The action to perform",
                },
                book_title: {
                  type: "string",
                  description:
                    "Exact book title (for add: the title of the book to add)",
                },
                author: {
                  type: "string",
                  description:
                    "Book author (used with add)",
                },
                status: {
                  type: "string",
                  enum: [
                    "unread",
                    "reading",
                    "read",
                    "unfinished",
                    "wishlist",
                  ],
                  description:
                    "Reading status (for add: defaults to 'read'; for update_status: required)",
                },
                rating: {
                  type: "number",
                  description:
                    "Rating from 0.25 to 5.0 in 0.25 increments, or 0 to clear (required for update_rating)",
                },
                date: {
                  type: "string",
                  description:
                    "YYYY-MM-DD, with add or update_status: the day the reader started (status 'reading'), finished (status 'read'), or stopped (status 'unfinished') the book. Only when the reader said when; never guess. update_status with the book's current status and a date just records the date.",
                },
              },
              required: ["action", "book_title"],
            },
          },
          {
            name: "search_library",
            description:
              "Search the reader's whole library, including the unread books and wishlist that aren't listed in your instructions. Results show page counts where known. Use it before saying the reader doesn't have a book, to see what they own by an author or on a subject, and to find candidates on their to-read pile when recommending what to read next. Three ways to search: query matches words in titles and authors; about finds books closest in meaning to a description, using each book's summary; like_title finds the books closest to one in the library. Status, tags, and type narrow any of them. Results use the same format as the library index, with predicted ratings for unread books.",
            input_schema: {
              type: "object" as const,
              properties: {
                query: {
                  type: "string",
                  description: "Words from the title or author, e.g. 'ishiguro' or 'remains of the day'. Leave out to filter by status, tags, or type alone.",
                },
                about: {
                  type: "string",
                  description: "Search by meaning: what the reader wants in plain words, e.g. 'a cold, spare novel about grief and memory' or 'the history of mathematics for a general reader'. Results come closest first, and sort is ignored.",
                },
                like_title: {
                  type: "string",
                  description: "Search by meaning for books like this one from the library (its title). Results come closest first, and sort is ignored.",
                },
                status: {
                  type: "array",
                  items: { type: "string", enum: ["unread", "wishlist", "read", "reading", "unfinished"] },
                  description: "Only books with these statuses",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Only books with at least one of these tags (vibes, topics, forms, and so on), e.g. ['atmospheric', 'dark']",
                },
                book_type: {
                  type: "string",
                  enum: ["fiction", "nonfiction", "poetry"],
                },
                sort: {
                  type: "string",
                  enum: ["predicted_rating", "title", "recently_finished", "recently_added"],
                  description: "predicted_rating puts the unread books the reader is likeliest to love first; recently_finished puts the books they finished most recently first (those with a finish date). Default title",
                },
                limit: {
                  type: "number",
                  description: "Max results (default 25, max 60)",
                },
              },
            },
          },
          {
            name: "search_releases",
            description:
              "Browse and search new book releases. Use to check what's coming out, find top recommendations, or search for specific titles or authors in the releases pipeline.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: ["browse", "top", "search"],
                  description:
                    "browse: list releases for a month; top: highest-scored releases; search: find by title/author",
                },
                month: {
                  type: "string",
                  description:
                    "Month to browse (e.g. '2026-02' or 'February 2026'). Defaults to current month for browse.",
                },
                query: {
                  type: "string",
                  description:
                    "Search term for title or author (required for search action)",
                },
                limit: {
                  type: "number",
                  description:
                    "Max results to return (default 10, max 20)",
                },
              },
              required: ["action"],
            },
          },
          {
            name: "manage_reading_paths",
            description:
              "Create and manage reading paths — structured intellectual journeys through books with seminar-style scaffolding. Each path has a thesis, and each book has pre-reading context, focus questions, and post-reading prompts. Books don't need to be in the library already — any book not found will be automatically added as a wishlist item. Reading paths are deeper than syllabi and designed for thematic exploration. Edit a path in place with update_seminar_content, reorder, and update_path, including writing focus questions for a book that has none. Never remove and re-add a book to change it: removing a book permanently deletes its seminar content and progress, so only remove a book or delete a path when the reader asks. Books stay in the library either way.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "create_path",
                    "view_path",
                    "add_path_books",
                    "update_progress",
                    "get_seminar_content",
                    "update_seminar_content",
                    "reorder",
                    "remove_path_books",
                    "update_path",
                    "delete_path",
                  ],
                  description: "The action to perform",
                },
                path_name: {
                  type: "string",
                  description:
                    "Name of the reading path (required for all actions except view-all)",
                },
                thesis: {
                  type: "string",
                  description:
                    "The framing thesis for the reading path (used with create_path and update_path)",
                },
                description: {
                  type: "string",
                  description:
                    "Path description (used with create_path and update_path)",
                },
                new_name: {
                  type: "string",
                  description: "New name for the path (used with update_path)",
                },
                books: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description:
                          "Book title (use exact library title if in library)",
                      },
                      author: {
                        type: "string",
                        description:
                          "Book author (important for books not yet in the library)",
                      },
                      pre_reading_context: {
                        type: "string",
                        description:
                          "Why this book is here and what it builds on",
                      },
                      focus_questions: {
                        type: "array",
                        items: { type: "string" },
                        description:
                          "2-4 questions to consider while reading",
                      },
                      post_reading_prompts: {
                        type: "array",
                        items: { type: "string" },
                        description:
                          "Discussion starters after finishing the book",
                      },
                    },
                    required: ["title"],
                  },
                  description:
                    "Books to add with optional seminar content (used with create_path and add_path_books), or books to remove by title (used with remove_path_books)",
                },
                book_title: {
                  type: "string",
                  description:
                    "Specific book title (used with update_progress, get_seminar_content, update_seminar_content, and with reorder to move one book)",
                },
                pre_reading_context: {
                  type: "string",
                  description:
                    "Why this book is here and what it builds on (used with update_seminar_content; left out keeps the current value)",
                },
                focus_questions: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "The book's complete set of 2-4 focus questions, replacing the current ones (used with update_seminar_content; left out keeps the current value)",
                },
                post_reading_prompts: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "The book's complete set of discussion starters, replacing the current ones (used with update_seminar_content; left out keeps the current value)",
                },
                ordered_titles: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "New order of books (used with reorder). Books left out keep their relative order after those named.",
                },
                position: {
                  type: "number",
                  description:
                    "1-based position (used with reorder to move book_title, and with add_path_books to insert there instead of at the end)",
                },
                progress: {
                  type: "string",
                  enum: ["not_started", "reading", "completed"],
                  description:
                    "New progress status (used with update_progress)",
                },
              },
              required: ["action"],
            },
          },
    ];

    // Paid-only tools: syllabi, reading paths, excerpts
    const PAID_TOOL_NAMES = new Set(["manage_syllabi", "manage_reading_paths", "save_excerpt"]);
    const tools = isPaid
      ? chatTools
      : chatTools.filter((t) => !("name" in t && PAID_TOOL_NAMES.has(t.name)));

    // Streaming tool loop
    let accumulatedText = "";

    while (true) {
      let roundText = "";
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        system: systemBlocks,
        messages: apiMessages,
        // Caches the conversation as it grows, so each tool call in a reply and each
        // quick follow-up reads what came before instead of paying full price for it
        cache_control: { type: "ephemeral" },
        tools,
        betas: ["context-management-2025-06-27"],
        max_tokens: 16000,
        output_config: { effort: "medium" },
      });

      // Forward text deltas to client. Text from separate rounds is joined
      // with a paragraph break so it doesn't run together.
      stream.on("text", (text) => {
        let chunk = text;
        if (roundText.length === 0 && accumulatedText.length > 0 && !accumulatedText.endsWith("\n\n")) {
          chunk = `\n\n${text}`;
        }
        roundText += text;
        accumulatedText += chunk;
        writeSSE(res, "text", { content: chunk });
      });

      const finalMessage = await stream.finalMessage();

      // Log token usage (best-effort, fire-and-forget)
      void logTokenUsage(supabase, userId, conversationId, "chat", MODEL, finalMessage.usage);

      // Check for tool use
      const toolUseBlocks = finalMessage.content.filter(
        (b) => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls — done
        break;
      }

      // Tool round — keep any text already streamed. The model often writes
      // its full reply and saves to memory in the same turn; its between-tool
      // progress notes arrive as thinking blocks, not text. Just show the
      // thinking indicator while tools run.
      writeSSE(res, "thinking", {});

      // Execute tool calls and build continuation messages
      apiMessages.push({
        role: "assistant",
        content: finalMessage.content,
      });

      const toolResults: Anthropic.Beta.Messages.BetaToolResultBlockParam[] =
        [];
      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;

        let result: string;
        let isError = false;
        try {
          if (block.name === "manage_syllabi") {
            invalidateSyllabusIndex(userId);
            result = await executeSyllabusCommand(
              supabase,
              block.input as SyllabusCommand,
            );
          } else if (block.name === "manage_wishlist") {
            result = await executeWishlistCommand(
              supabase,
              block.input as WishlistCommand,
            );
          } else if (block.name === "save_excerpt") {
            result = await executeExcerptCommand(
              supabase,
              block.input as ExcerptCommand,
              conversationId,
              linkedBook,
            );
          } else if (block.name === "manage_book") {
            result = await executeBookCommand(
              supabase,
              block.input as BookCommand,
              today,
            );
          } else if (block.name === "search_library") {
            result = await executeLibrarySearch(
              supabase,
              block.input as LibrarySearchCommand,
            );
          } else if (block.name === "search_releases") {
            result = await executeReleasesCommand(
              supabase,
              block.input as ReleasesCommand,
            );
          } else if (block.name === "manage_reading_paths") {
            invalidateSyllabusIndex(userId);
            result = await executeReadingPathCommand(
              supabase,
              block.input as ReadingPathCommand,
              today,
            );
          } else if (block.name === "update_memory") {
            result = await executeMemoryCommand(
              supabase,
              block.input as MemoryCommand,
            );
          } else {
            throw new Error(`Unknown tool: ${block.name}`);
          }
        } catch (err) {
          // Supabase throws PostgrestError objects, not Error instances
          const message =
            err instanceof Error
              ? err.message
              : typeof err === "object" && err !== null && "message" in err
                ? String(err.message)
                : String(err);
          result = `Error: ${message}`;
          isError = true;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
          ...(isError && { is_error: true }),
        });
      }

      apiMessages.push({
        role: "user",
        content: toolResults,
      });

      // Continue the loop for another round
    }

    // Save assistant message
    const { data: savedMsg, error: saveError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: accumulatedText,
      })
      .select("id")
      .single();

    if (saveError) throw saveError;
    replySaved = true;

    writeSSE(res, "done", { message_id: savedMsg.id });

    // Title generation: if this is the first exchange (2 messages)
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (count === 2) {
      // Fire-and-forget title generation
      void generateTitle(supabase, userId, conversationId, body.message, accumulatedText);
    }

    // Condense a long conversation for the next reply, in the background
    const condensingId = conversationId;
    void condenseIfLong(supabase, anthropic, MODEL, condensingId)
      .then((usage) => {
        if (usage) void logTokenUsage(supabase, userId, condensingId, "condense", MODEL, usage);
      })
      .catch((err) => console.error("[history] Condensing failed:", err instanceof Error ? err.message : err));
  } catch (err) {
    // A spend limit, rate limit, or overload is "try again later", not a failure to show
    const message = isCapacityError(err) ? BUSY_MESSAGE : err instanceof Error ? err.message : String(err);
    if (isCapacityError(err)) console.error("[chat] Anthropic capacity or spend limit:", err instanceof Error ? err.message : err);
    writeSSE(res, "error", { message });

    // A reader isn't charged a message for a reply they didn't get
    if (claimsMessage && !replySaved) {
      void releaseMessage(serviceSupabase, userId).catch((releaseError) => {
        console.error("[chat] Couldn't return a free message:", releaseError);
      });
    }
  }

  res.end();
}

async function generateTitle(
  supabase: ReturnType<typeof createUserClient>,
  userId: string,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system:
        "Generate a 3-6 word title for this conversation. Return only the title, no quotes or punctuation.",
      messages: [
        {
          role: "user",
          content: `User: ${userMessage.slice(0, 200)}\n\nAssistant: ${assistantMessage.slice(0, 200)}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      await supabase
        .from("conversations")
        .update({ title: textBlock.text.trim() })
        .eq("id", conversationId);
    }

    // Log token usage for title generation
    void logTokenUsage(supabase, userId, conversationId, "title", MODEL, response.usage);
  } catch {
    // Title generation is best-effort
  }
}

async function handleIsbndbProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  // Verify auth — ISBNdb proxy requires authenticated user
  try {
    await authenticateRequest(req.headers.authorization);
  } catch {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "ISBNdb API key not configured" }));
    return;
  }

  // Strip /api/isbndb prefix to get the ISBNdb path
  const isbndbPath = req.url!.replace(/^\/api\/isbndb/, "");

  try {
    // One book by ISBN: from the shared cache when any library has brought it in before
    const single = isbndbPath.match(/^\/book\/([0-9Xx-]+)(?:\?.*)?$/);
    if (single) {
      const { found } = await lookupIsbns([single[1]]);
      const book = found.values().next().value;
      res.writeHead(book ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(book ? { book } : { errorMessage: "Not Found" }));
      return;
    }

    // Searches go to ISBNdb (one call each), and every book they return is cached
    const response = await isbndbFetch(isbndbPath);
    const text = await response.text();
    if (response.ok) {
      try {
        const body = JSON.parse(text) as { books?: ISBNdbBook[] };
        if (Array.isArray(body.books)) void cacheBooks(body.books);
      } catch {
        // Not JSON; pass it through as is
      }
    }
    res.writeHead(response.status, {
      "Content-Type": response.headers.get("content-type") || "application/json",
    });
    res.end(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `ISBNdb proxy error: ${message}` }));
  }
}

function serveStaticFile(
  res: http.ServerResponse,
  filePath: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);

  const headers: Record<string, string> = { "Content-Type": contentType };
  // Cache hashed assets (Vite adds content hashes to filenames in assets/)
  if (filePath.includes("/assets/")) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  res.writeHead(200, headers);
  res.end(content);
  return true;
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  // API routes get CORS headers
  if (url.startsWith("/api/")) {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Per-address limits. Stripe's webhook is exempt: Stripe retries, and it's signed.
    if (url !== "/api/stripe/webhook") {
      const ip = clientIp(req);
      const rules: (keyof typeof RULES)[] = ["api"];
      if (url === "/api/chat") rules.push("chatPerIp");
      else if (url === "/api/contact") rules.push("contact");
      else if (url.startsWith("/api/isbndb/")) rules.push("isbndb");
      else if (
        url === "/api/releases/curate" || url === "/api/stripe/checkout" ||
        url === "/api/stripe/portal" || url === "/api/account/delete"
      ) rules.push("sensitive");
      for (const rule of rules) {
        const result = hit(rule, ip);
        if (!result.ok) {
          rejectRateLimited(res, result.retryAfter);
          return;
        }
      }
    }

    if (req.method === "POST" && url === "/api/chat") {
      handleChat(req, res).catch((err) => failRequest(res, "chat", err));
      return;
    }

    if (req.method === "GET" && url === "/api/greeting") {
      void (async () => {
        // Auth: create per-request client for greeting
        let userSupabase;
        let userId: string;
        try {
          ({ supabase: userSupabase, userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          // Past the day's chat budget, the home page goes without a new greeting
          if (await dailyBudgetReached(serviceSupabase)) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ greeting: "" }));
            return;
          }
          const result = await getGreeting(userSupabase, anthropic, userId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ greeting: result.greeting }));

          // Log token usage if a fresh greeting was generated (not cached)
          if (result.usage) {
            void logTokenUsage(userSupabase, userId, null, "greeting", MODEL, result.usage);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      })();
      return;
    }

    if (req.method === "POST" && url === "/api/contact") {
      void (async () => {
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown>;

          const { name, email, message } = body;
          if (!name || !email || !message) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "name, email, and message are required" }));
            return;
          }

          const { error } = await serviceSupabase
            .from("contact_submissions")
            .insert({ name, email, message });

          if (error) throw error;

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[contact] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to send message" }));
        }
      })();
      return;
    }

    if (req.method === "POST" && url === "/api/account/delete") {
      void (async () => {
        let userId: string;
        try {
          ({ userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          const { error } = await serviceSupabase.auth.admin.deleteUser(userId);
          if (error) throw error;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[account/delete] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to delete account" }));
        }
      })();
      return;
    }

    if (req.method === "POST" && url === "/api/onboarding/complete") {
      void (async () => {
        let userId: string;
        try {
          ({ userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          const { error } = await serviceSupabase
            .from("user_subscriptions")
            .update({ onboarding_completed_at: new Date().toISOString() })
            .eq("user_id", userId);

          if (error) throw error;

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[onboarding/complete] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to complete onboarding" }));
        }
      })();
      return;
    }

    // A reader asks for their releases to be curated: personal scores on each month's
    // notable releases, from now on while they keep visiting Releases
    if (req.method === "POST" && url === "/api/releases/curate") {
      void (async () => {
        let userId: string;
        try {
          ({ userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          // Personal scores are judged against the reader profile, so one has to exist
          const { count, error: profileError } = await serviceSupabase
            .from("reader_profile")
            .select("user_id", { count: "exact", head: true })
            .eq("user_id", userId);
          if (profileError) throw profileError;
          if (!count) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "no_profile" }));
            return;
          }

          const now = new Date().toISOString();
          const { error } = await serviceSupabase
            .from("release_curation")
            .upsert({ user_id: userId, requested_at: now, last_visited_at: now }, { onConflict: "user_id" });
          if (error) throw error;

          requestReleasesCheck();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ requested_at: now }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[releases/curate] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to request curation" }));
        }
      })();
      return;
    }

    if (req.method === "GET" && url.startsWith("/api/isbndb/")) {
      handleIsbndbProxy(req, res).catch((err) => failRequest(res, "isbndb", err));
      return;
    }

    // Stripe endpoints
    if (req.method === "POST" && url === "/api/stripe/webhook") {
      void (async () => {
        try {
          const rawBody = await readRawBody(req);
          const signature = req.headers["stripe-signature"] as string;

          if (!signature) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing stripe-signature header" }));
            return;
          }

          const result = await handleStripeWebhook(rawBody, signature, serviceSupabase);
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(result.body);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[stripe/webhook] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Webhook processing failed" }));
        }
      })();
      return;
    }

    if (req.method === "POST" && url === "/api/stripe/checkout") {
      void (async () => {
        let userId: string;
        let supabase;
        try {
          ({ supabase, userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          const body = (await readJsonBody(req)) as Record<string, unknown>;

          const plan = body.plan as "monthly" | "annual";
          if (plan !== "monthly" && plan !== "annual") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "plan must be 'monthly' or 'annual'" }));
            return;
          }

          // Get user email from Supabase auth
          const { data: { user } } = await supabase.auth.getUser();
          const email = user?.email ?? "";

          const origin = req.headers.origin || "https://rekollekt.io";
          const checkoutUrl = await createCheckoutSession(userId, email, plan, origin);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ url: checkoutUrl }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[stripe/checkout] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to create checkout session" }));
        }
      })();
      return;
    }

    if (req.method === "POST" && url === "/api/stripe/portal") {
      void (async () => {
        let userId: string;
        try {
          ({ userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          const sub = await getOrCreateSubscription(userId);
          if (!sub.stripe_customer_id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No active subscription to manage" }));
            return;
          }

          const origin = req.headers.origin || "https://rekollekt.io";
          const portalUrl = await createPortalSession(sub.stripe_customer_id, origin);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ url: portalUrl }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[stripe/portal] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to create portal session" }));
        }
      })();
      return;
    }

    if (req.method === "GET" && url === "/api/subscription") {
      void (async () => {
        let userId: string;
        try {
          ({ userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        try {
          const sub = await getOrCreateSubscription(userId);
          const isPaid = isPaidAndActive(sub);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            plan: sub.plan,
            status: sub.status,
            chat_messages_used: sub.chat_messages_used,
            chat_messages_limit: isPaid ? null : FREE_MESSAGE_LIMIT,
            current_period_end: sub.current_period_end,
            cancel_at_period_end: sub.cancel_at_period_end,
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[subscription] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to fetch subscription" }));
        }
      })();
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // Static file serving (production: dist/ exists)
  if (fs.existsSync(DIST_DIR)) {
    // Try exact file path
    const safePath = path.normalize(url).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(DIST_DIR, safePath);

    if (serveStaticFile(res, filePath)) return;

    // SPA fallback: serve index.html for all non-file routes
    const indexPath = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
      return;
    }
  }

  // No dist/ directory (dev mode) — only API routes are served
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found — in development, use Vite dev server for frontend");
});

server.listen(PORT, () => {
  console.log(`Rekollekt chat server listening on http://localhost:${PORT}`);
  if (jobsInWorker()) {
    console.log("Background jobs run in the worker (JOBS_IN_WORKER=true).");
  } else {
    startBackgroundJobs(serviceSupabase, jobsAnthropic, MODEL);
  }
});
