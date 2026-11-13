import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { authenticateRequest, type createUserClient } from "./auth.js";
import { buildLibraryIndex, invalidateLibraryIndex } from "./library-index.js";
import { actionRecord, changesBooks, withActions, type ActionRecord } from "./action-log.js";
import { executeLibrarySearch, type LibrarySearchCommand } from "./library-search.js";
import { loadReaderProfile } from "./profile-loader.js";
import { executeMemoryCommand, loadCoreMemory, type MemoryCommand } from "./memory-handler.js";
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
import { getGreeting, parseReaderTime } from "./greeting-handler.js";
import { isIsoDate } from "../src/lib/reading-dates.js";
import { buildBookContext, type LinkedBook } from "./book-context.js";
import { claimMessage, FREE_PERIOD_ENDS, hasCompanion, inFreePeriod, isPaidAndActive, releaseMessage } from "./subscription.js";
import { BodyTooLargeError, readJsonBody, readRawBody } from "./request-body.js";
import { clientIp, hit, rejectRateLimited, type RULES } from "./rate-limit.js";
import { condenseIfLong, historySummaryBlock, loadHistory } from "./conversation-history.js";
import { BACKGROUND_RESERVE, cacheBooks, isbndbFetch, lookupIsbns } from "./isbndb.js";
import type { ISBNdbBook } from "../src/lib/editions.js";
import { recordClaudeUsage } from "./usage.js";
import { BUSY_MESSAGE, dailyBudget, dailyBudgetReached, isCapacityError, recordSpend, spentToday, type TokenUsage } from "./spend-guard.js";
import { requestReleasesCheck } from "./releases-scheduler.js";
import { profileStatus, requestProfile } from "./profile-scheduler.js";
import { jobsInWorker, startBackgroundJobs } from "./background-jobs.js";
import { startHealthReports } from "./health.js";
import { CHAT_MODEL } from "./models.js";
import { buildOnboardingPrompt } from "./onboarding-prompt.js";
import { COMPANION_MONTHLY_REPLIES, FREE_MONTHLY_REPLIES, ONBOARDING_FREE_MESSAGES } from "../src/lib/plans.js";
import { allowedWithoutCompanion, buildInstructions, buildReaderContext, chatTools, PROMPT_CACHE } from "./chat-prompt.js";
import {
  handleStripeWebhook,
  createCheckoutSession,
  createPortalSession,
} from "./stripe-handler.js";

config();

const MODEL = CHAT_MODEL;

/** Record a chat-workspace call's cost (api_usage) and add it to today's chat spend. */
async function logTokenUsage(
  _supabase: unknown,
  userId: string,
  conversationId: string | null,
  endpoint: string,
  model: string,
  usage: TokenUsage,
): Promise<void> {
  recordSpend(model, usage);
  await recordClaudeUsage(endpoint, model, usage, { userId, conversationId });
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

const FREE_MESSAGE_LIMIT = FREE_MONTHLY_REPLIES;
/** Fair-use cap on paid (and promotional) readers' chat replies a month: about $7.50 at today's cost per reply. */
const PAID_MONTHLY_REPLY_CAP = Number(process.env.PAID_MONTHLY_REPLY_CAP) || COMPANION_MONTHLY_REPLIES;
/** Onboarding chat is free of the monthly limits up to this many messages, then counts like any other chat. */
const ONBOARDING_MESSAGE_LIMIT = ONBOARDING_FREE_MESSAGES;
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
    "Content-Type, Authorization, X-Reader-Time",
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
  // Companion (a paying subscriber, or anyone during the free period) gets the larger cap
  const paid = hasCompanion(subscription);
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

    const isPaid = hasCompanion(subscription);

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
        // A reply's record of what it did with tools goes back with it (see action-log.ts)
        content: m.role === "assistant" ? withActions(m.content, m.actions) : m.content,
      }));

    // Free readers get a subset of the tools
    const tools = chatTools(isPaid);

    // Streaming tool loop
    let accumulatedText = "";
    const actions: ActionRecord[] = [];

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
        // Low, not medium: on 12 real messages it wrote as well, acted more readily on
        // requests, and cost about 5% less (tested November 2026, see next_steps.md)
        output_config: { effort: "low" },
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
          if (!isPaid && !allowedWithoutCompanion(block.name, block.input)) {
            // The tools offered without Companion only look; this holds even if asked otherwise
            throw new Error("That needs the Companion plan. Existing syllabi and reading paths can be viewed but not changed.");
          } else if (block.name === "manage_syllabi") {
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

        const record = actionRecord(block.name, block.input, result, isError);
        if (record) actions.push(record);
        // The library index is cached for 10 minutes; the next message should see this change
        if (changesBooks(record)) invalidateLibraryIndex(userId);

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
        ...(actions.length > 0 && { actions }),
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
        url === "/api/releases/curate" || url === "/api/profile/generate" || url === "/api/stripe/checkout" ||
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
          // The reader's own date and hour, since the server runs on UTC
          const readerTime = parseReaderTime(req.headers["x-reader-time"]);
          const result = await getGreeting(userSupabase, anthropic, userId, readerTime);
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
    // Profiles the reader generates: the monthly one when it's due, and Companion's weekly
    // refresh (server/profile-scheduler.ts). The worker picks requests up within a minute.
    if ((req.method === "GET" && url === "/api/profile/status") || (req.method === "POST" && url === "/api/profile/generate")) {
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
          const companion = hasCompanion(await getOrCreateSubscription(userId));
          if (req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(await profileStatus(serviceSupabase, userId, companion)));
            return;
          }
          const result = await requestProfile(serviceSupabase, userId, companion);
          res.writeHead("error" in result ? 409 : 200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[profile] Error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed" }));
        }
      })();
      return;
    }

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

    // The admin page's numbers: costs, activity, quotas, and job health. Admins only
    // (ADMIN_USER_IDS); anyone else gets a 404, so the endpoint doesn't announce itself.
    if (req.method === "GET" && url.startsWith("/api/admin/overview")) {
      void (async () => {
        let userId: string;
        try {
          ({ userId } = await authenticateRequest(req.headers.authorization));
        } catch {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        const admins = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
        if (!admins.includes(userId)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        try {
          const days = Math.min(Math.max(Number(new URL(url, "http://x").searchParams.get("days")) || 30, 1), 90);
          const [{ data, error }, { data: reconciliation, error: reconError }, { data: revenue, error: revenueError }] = await Promise.all([
            serviceSupabase.rpc("admin_overview", { p_days: days }),
            serviceSupabase
              .from("cost_reconciliation")
              .select("day, workspace, workspace_name, anthropic_usd, recorded_usd, checked_at")
              .order("day", { ascending: false })
              .limit(21),
            serviceSupabase.rpc("admin_revenue"),
          ]);
          if (error) throw error;
          if (reconError) throw reconError;
          if (revenueError) throw revenueError;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ...(data as Record<string, unknown>),
            limits: {
              daily_chat_budget_usd: dailyBudget(),
              chat_spent_today_usd: await spentToday(serviceSupabase),
              paid_monthly_reply_cap: PAID_MONTHLY_REPLY_CAP,
              free_monthly_messages: FREE_MESSAGE_LIMIT,
              isbndb_daily_quota: 5000,
              isbndb_background_reserve: BACKGROUND_RESERVE,
              voyage_free_tokens: 200_000_000,
              database_included_bytes: 8 * 1024 ** 3,
            },
            jobs_in_worker: jobsInWorker(),
            reconciliation: reconciliation ?? [],
            revenue,
          }));
        } catch (err) {
          failRequest(res, "admin", err);
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
          const companion = hasCompanion(sub);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            plan: sub.plan,
            status: sub.status,
            // Whether they get Companion features, and, when that's only from the free
            // period, when it ends
            companion,
            free_period_ends: !isPaidAndActive(sub) && inFreePeriod() ? FREE_PERIOD_ENDS.toISOString() : null,
            chat_messages_used: sub.chat_messages_used,
            chat_messages_limit: companion ? null : FREE_MESSAGE_LIMIT,
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
  startHealthReports(serviceSupabase, "web");
});
