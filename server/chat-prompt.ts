import type Anthropic from "@anthropic-ai/sdk";
import { MAX_MEMORY_CHARS } from "./memory-handler.js";

/**
 * What the chat server sends Claude besides the conversation: the instructions, the
 * reader's context block, and the tools. Kept apart from the request handling in
 * index.ts so a test can send exactly the same request.
 */

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
export const PROMPT_CACHE = { type: "ephemeral" as const, ttl: "1h" as const };

export function buildInstructions(isPaid: boolean): string {
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

export function buildReaderContext(libraryIndex: string, readerProfile: string | null): string {
  const sections = [];
  if (readerProfile) sections.push(`## Reader Profile\n\n${readerProfile}`);
  sections.push(`## The Reader's Library\n\n${libraryIndex}`);
  return sections.join("\n\n");
}

/** Paid-only tools: syllabi, reading paths, excerpts */
const PAID_TOOL_NAMES = new Set(["manage_syllabi", "manage_reading_paths", "save_excerpt"]);

/** The chat tools; free readers get a subset. */
export function chatTools(isPaid: boolean): Anthropic.Beta.Messages.BetaToolUnion[] {
  return isPaid ? ALL_TOOLS : ALL_TOOLS.filter((t) => !("name" in t && PAID_TOOL_NAMES.has(t.name)));
}

const ALL_TOOLS: Anthropic.Beta.Messages.BetaToolUnion[] = [
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
