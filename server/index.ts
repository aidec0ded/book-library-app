import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { createUserClient, getUserIdFromToken } from "./auth.js";
import { buildLibraryIndex } from "./library-index.js";
import { loadReaderProfile } from "./profile-loader.js";
import { executeMemoryCommand, type MemoryCommand } from "./memory-handler.js";
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
import { buildSyllabusIndex } from "./syllabus-index.js";
import { getGreeting } from "./greeting-handler.js";
import { startProfileScheduler } from "./profile-scheduler.js";

config();

const MODEL = "claude-sonnet-4-5-20250929";
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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function buildSystemPrompt(
  libraryIndex: string,
  readerProfile: string | null,
  syllabusIndex: string | null,
): string {
  let prompt = `You are the reading companion for Rekollekt, a personal book library app.
You are a sharp, well-read literary mind — think engaged seminar leader,
not enthusiastic assistant. You have genuine respect for the reader's taste,
but your job is to deepen their thinking, not validate their choices.

Your role:
- Discuss what the reader is currently reading and how it's affecting them
- Make connections between books in their library
- Explore why certain books resonate and others don't — push past surface reactions
- Help the reader reflect on their evolving tastes and reading life
- Challenge comfortable interpretations when you have a real literary reason to
- Remember what you learn about the reader using your memory tool

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

When you learn something meaningful — preferences, emotional reactions,
connections between books, evolving tastes — record it in your memory.
Check your memory at the start of each conversation.

Keep your memory organized. Prefer updating existing files over creating
new ones.

You can create and manage curated syllabi using your manage_syllabi tool.
Create syllabi when the reader asks, or suggest them when you notice patterns
(e.g. "You've mentioned several cold, atmospheric novels — want me to
make a syllabus?"). Always confirm before creating proactively.
Reference books by their exact title as shown in the library.

You can manage the reader's wishlist using your manage_wishlist tool.
When the reader mentions a book they want to read that isn't in their
library, offer to add it to their wishlist. You can also view and
remove books from the wishlist.

You can save curated insights and observations to specific books using your
save_excerpt tool. When a conversation surfaces a compelling interpretation,
emotional reaction, or thematic connection about a book, offer to save it.
The content should be a polished, self-contained 1-3 sentence insight —
not raw conversation text. These excerpts appear on the book's detail page
under "From Conversations." Always confirm with the reader before saving.

You can update books in the library using your manage_book tool. When the
reader says they started, finished, or gave up on a book, update its status.
When they rate a book, set the rating. You can also mark/unmark favorites
and remove books from the library. Always confirm before deleting a book.

You can browse new releases using your search_releases tool. Use it to check
what books are coming out, find top recommendations, or search for specific
titles or authors in the releases pipeline.

You can create and manage reading paths using your manage_reading_paths tool.
Reading paths are structured intellectual journeys — deeper than syllabi, with
sequencing logic, pre-reading context, focus questions, and post-reading
reflection prompts. Create paths when the reader wants to explore a theme,
movement, or idea across multiple books. Each path has a thesis that frames
the journey. When discussing a book that belongs to an active reading path,
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

  if (readerProfile) {
    prompt += `\n\n## Reader Profile\n\n${readerProfile}`;
  }

  if (syllabusIndex) {
    prompt += `\n\n${syllabusIndex}`;
  }

  prompt += `\n\n## The Reader's Library\n\n${libraryIndex}`;

  return prompt;
}

interface ChatRequest {
  conversation_id: string | null;
  message: string;
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

async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  // Auth: create per-request client
  let supabase;
  let userId: string;
  try {
    supabase = createUserClient(req.headers.authorization);
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    userId = getUserIdFromToken(token);
  } catch {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Parse body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString()) as ChatRequest;

  if (!body.message || typeof body.message !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "message is required" }));
    return;
  }

  // SSE headers
  setCorsHeaders(req, res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    // Create or reuse conversation
    let conversationId = body.conversation_id;
    if (!conversationId) {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({})
        .select("id")
        .single();

      if (convError) throw convError;
      conversationId = conv.id as string;
    }

    writeSSE(res, "meta", { conversation_id: conversationId });

    // Insert user message
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: body.message,
    });
    if (msgError) throw msgError;

    // Load conversation history
    const { data: history, error: histError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (histError) throw histError;

    // Build system prompt with library index, reader profile, and list context
    const [libraryIndex, readerProfile, syllabusIndex] = await Promise.all([
      buildLibraryIndex(supabase, userId),
      loadReaderProfile(supabase, userId),
      buildSyllabusIndex(supabase, userId),
    ]);
    const systemPrompt = buildSystemPrompt(libraryIndex, readerProfile, syllabusIndex);

    // Build API messages from history
    const apiMessages: Anthropic.Beta.Messages.BetaMessageParam[] =
      history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      }));

    // Streaming tool loop
    let accumulatedText = "";

    while (true) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: apiMessages,
        tools: [
          { type: "memory_20250818" as const, name: "memory" },
          {
            name: "manage_syllabi",
            description:
              "Create and manage curated syllabi (themed reading collections) from the reader's library. Use this to build themed syllabi, reading recommendations, or collections based on conversation context. Books are referenced by their exact title as shown in the library index.",
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
                  description: "Syllabus description (used with create)",
                },
                books: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Book titles exactly as they appear in the library (e.g. 'The Road')",
                },
                rationale: {
                  type: "string",
                  description:
                    "Brief explanation of why these books belong in the syllabus (used with create and add_books)",
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
              "Save a curated insight or observation from the current conversation to a specific book. Use when conversation surfaces a compelling interpretation, emotional reaction, or thematic connection worth preserving.",
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
                    "Exact book title as shown in the library",
                },
                content: {
                  type: "string",
                  description:
                    "Polished 1-3 sentence insight to save (required for save)",
                },
              },
              required: ["action", "book_title"],
            },
          },
          {
            name: "manage_book",
            description:
              "Update a book's status, rating, or favorite flag, or remove it from the library. Use when the reader says they started, finished, or gave up on a book, rates a book, marks a favorite, or wants to delete a book.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: [
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
                    "Exact book title as shown in the library",
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
                    "New reading status (required for update_status)",
                },
                rating: {
                  type: "number",
                  description:
                    "Rating from 0.25 to 5.0 in 0.25 increments, or 0 to clear (required for update_rating)",
                },
              },
              required: ["action", "book_title"],
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
              "Create and manage reading paths — structured intellectual journeys through books with seminar-style scaffolding. Each path has a thesis, and each book has pre-reading context, focus questions, and post-reading prompts. Reading paths are deeper than syllabi and designed for thematic exploration.",
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
                    "The framing thesis for the reading path (used with create_path)",
                },
                description: {
                  type: "string",
                  description:
                    "Path description (used with create_path)",
                },
                books: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description:
                          "Book title exactly as it appears in the library",
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
                    "Books to add with optional seminar content (used with create_path and add_path_books)",
                },
                book_title: {
                  type: "string",
                  description:
                    "Specific book title (used with update_progress and get_seminar_content)",
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
        ],
        betas: ["context-management-2025-06-27"],
        max_tokens: 4096,
      });

      // Forward text deltas to client
      stream.on("text", (text) => {
        accumulatedText += text;
        writeSSE(res, "text", { content: text });
      });

      const finalMessage = await stream.finalMessage();

      // Check for tool use
      const toolUseBlocks = finalMessage.content.filter(
        (b) => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls — done
        break;
      }

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
        try {
          if (block.name === "manage_syllabi") {
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
            );
          } else if (block.name === "manage_book") {
            result = await executeBookCommand(
              supabase,
              block.input as BookCommand,
            );
          } else if (block.name === "search_releases") {
            result = await executeReleasesCommand(
              supabase,
              block.input as ReleasesCommand,
            );
          } else if (block.name === "manage_reading_paths") {
            result = await executeReadingPathCommand(
              supabase,
              block.input as ReadingPathCommand,
            );
          } else {
            result = await executeMemoryCommand(
              supabase,
              block.input as MemoryCommand,
            );
          }
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
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

    writeSSE(res, "done", { message_id: savedMsg.id });

    // Title generation: if this is the first exchange (2 messages)
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (count === 2) {
      // Fire-and-forget title generation
      void generateTitle(supabase, conversationId, body.message, accumulatedText);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeSSE(res, "error", { message });
  }

  res.end();
}

async function generateTitle(
  supabase: ReturnType<typeof createUserClient>,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 50,
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
    createUserClient(req.headers.authorization);
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
  const upstream = `https://api2.isbndb.com${isbndbPath}`;

  try {
    const response = await fetch(upstream, {
      method: req.method,
      headers: { Authorization: apiKey },
    });

    res.writeHead(response.status, {
      "Content-Type": response.headers.get("content-type") || "application/json",
    });
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
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

    if (req.method === "POST" && url === "/api/chat") {
      void handleChat(req, res);
      return;
    }

    if (req.method === "GET" && url === "/api/greeting") {
      // Auth: create per-request client for greeting
      let userSupabase;
      let userId: string;
      try {
        userSupabase = createUserClient(req.headers.authorization);
        const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
        userId = getUserIdFromToken(token);
      } catch {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      void (async () => {
        try {
          const greeting = await getGreeting(userSupabase, anthropic, userId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ greeting }));
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
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString());

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
          const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
          userId = getUserIdFromToken(token);
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

    if (req.method === "GET" && url.startsWith("/api/isbndb/")) {
      void handleIsbndbProxy(req, res);
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
  startProfileScheduler(serviceSupabase);
});
