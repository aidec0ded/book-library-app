# MoodLib

Personal book library app that recommends books based on mood, season, and vibe. 1,711 books imported from BookBuddy+ catalog and a curated fiction spreadsheet. AI-powered vibe tagging via Claude API.

## Vision

MoodLib is built around a core belief: the value of a personal library isn't just what's on the shelves — it's in understanding how books affect you as a person, and using that understanding to guide what you read next.

The app's central loop is: **read → reflect → AI understanding deepens → better recommendations and insights → read more intentionally**. Ratings and notes alone don't capture why a book resonated. The AI reading companion (Phase 11) is the mechanism for deeper reflection — a place to discuss what you're reading, how it's making you feel, and how it connects to other books and ideas. Over time, the AI builds a reader profile that enables genuinely personal recommendations, predicted ratings, and proactive suggestions grounded in the reader's evolving tastes.

Everything should feel personal. The app should celebrate the reader's own library and make them excited to "step into" it — not replicate a public review site or bookstore.

## Commands

```bash
npm install                          # install dependencies
npm run dev                          # start Vite dev server
npm run build                        # production build → dist/
npm run preview                      # preview production build
npx tsx scripts/import-books.ts      # import CSV data into Supabase (destructive — re-inserts all rows)
npx tsx scripts/tag-vibes.ts         # AI vibe tagging (see flags below)
npx tsx scripts/tag-vibes.ts --dry-run          # preview prompts, no DB writes
npx tsx scripts/tag-vibes.ts --limit 10         # process only first 10 books
npx tsx scripts/tag-vibes.ts --force            # re-tag books that already have AI vibes
npx tsx scripts/enrich-isbndb.ts               # enrich books via ISBNdb (cover images, metadata)
npx tsx scripts/enrich-isbndb.ts --dry-run     # list books that would be enriched, no API calls
npx tsx scripts/enrich-isbndb.ts --limit 10    # process only first 10 books
npx tsx scripts/enrich-isbndb.ts --force       # re-enrich books already looked up
npm run dev:server                             # start chat API server (port 3001, auto-restarts)
npx tsx scripts/generate-profile.ts            # generate reader profile via Claude API
npx tsx scripts/generate-profile.ts --dry-run  # preview prompt, no API call or DB write
npx tsx scripts/generate-profile.ts --force    # regenerate even if generated this month
npx tsx scripts/generate-profile.ts --bootstrap # library data only (skip memory + conversations)
npx tsx scripts/predict-ratings.ts             # generate AI predicted ratings for unread books
npx tsx scripts/predict-ratings.ts --dry-run   # preview prompt, no API calls or DB writes
npx tsx scripts/predict-ratings.ts --limit 20  # process only first 20 books
npx tsx scripts/predict-ratings.ts --force     # re-predict books that already have predictions
```

Dev workflow requires two terminals: `npm run dev` (Vite, port 5173) + `npm run dev:server` (chat API, port 3001). Vite proxies `/api/chat` to the chat server.

SQL migrations (`supabase/migrations/`) are run manually in the Supabase SQL Editor, not via CLI.

## Tech Stack

- React + Vite + TypeScript (frontend)
- Supabase (PostgreSQL + auth + Row Level Security)
- Tailwind + shadcn/ui for styling
- Claude API (`@anthropic-ai/sdk`) for AI vibe tagging + reading companion chat
- ESM throughout (`"type": "module"` in package.json)

## Architecture

**Current:** Import pipeline + AI tagging pipeline + chat server + interactive frontend. Two CSV source files are parsed, merged on a normalized title+author key, and batch-inserted into Supabase. The `tag-vibes.ts` script bulk-tags fiction-list books with AI-generated vibes via Claude API. A standalone Node.js server (`server/index.ts`) handles Claude API streaming for the reading companion chat. The React frontend provides a searchable, paginated book list, detail view with vibe editing, seasonal recommendations, and an AI reading companion chat.

**Frontend structure:**
- `src/main.tsx` — React entry point
- `src/App.tsx` — React Router: `/` (BookList), `/add` (AddBook), `/books/:id` (BookDetail), `/lists` (ListsPage), `/lists/:id` (ListDetail), `/profile` (Profile)
- `src/components/Layout.tsx` — App shell with header + `<Outlet />`
- `src/pages/BookList.tsx` — Debounced search, pagination via Supabase `.range()`
- `src/pages/BookDetail.tsx` — Full book metadata display with inline editing (status, rating, favorite, up next, notes) + predicted rating display
- `src/lib/supabase.ts` — Supabase client (uses `VITE_SUPABASE_ANON_KEY`)
- `src/lib/books.ts` — Book update helper (type-constrained to editable fields)
- `src/lib/vibes.ts` — Vibe CRUD operations (fetch, add, remove, confirm)
- `src/components/VibeEditor.tsx` — Inline vibe editor with AI badge styling and confirm/remove actions
- `src/pages/AddBook.tsx` — ISBNdb search, preview, and add-to-library flow
- `src/lib/isbndb.ts` — ISBNdb API client (search, lookup, ISBN detection, field mapping)
- `src/components/ui/` — shadcn/ui components (Badge, Card, Input, Select, Separator, Textarea)
- `src/pages/Chat.tsx` — AI reading companion chat page with streaming responses
- `src/lib/chat.ts` — Conversation CRUD + SSE streaming client
- `src/components/ChatMessage.tsx` — Chat message bubble component (user/assistant)
- `src/components/ConversationList.tsx` — Past conversations panel (collapsible)
- `server/index.ts` — Chat API server (Node.js HTTP, Claude streaming + memory tool loop, port 3001)
- `server/library-index.ts` — Builds compact library index for system prompt (cached 10min)
- `server/memory-handler.ts` — Memory tool command executor against Supabase memory_files table
- `scripts/tag-vibes.ts` — Bulk AI vibe tagging script (batches of 5, retries, --dry-run/--limit/--force flags)
- `src/pages/Profile.tsx` — Reader profile page with editable Personal Canon
- `src/lib/profile.ts` — Profile CRUD + personal canon updates
- `src/components/BookSearchModal.tsx` — Library search modal for canon editing
- `src/components/PersonalCanonEditor.tsx` — Canon grid with add/remove
- `server/profile-loader.ts` — Cached profile loader for chat system prompt (10min TTL)
- `scripts/generate-profile.ts` — Claude-powered reader profile generation (monthly, opus model)
- `scripts/predict-ratings.ts` — AI predicted rating generation for unread books (batches of 20, Sonnet 4.5, --dry-run/--limit/--force flags)
- `scripts/enrich-isbndb.ts` — Bulk ISBNdb enrichment script (1 req/sec, retries, --dry-run/--limit/--force flags)
- `src/pages/ListsPage.tsx` — Lists index with create form and grid of list cards
- `src/pages/ListDetail.tsx` — List detail with ordered books, reorder controls, add/remove, inline editing
- `src/lib/lists.ts` — List CRUD operations (create, update, delete, add/remove/reorder items)

**MVP phases (complete):**
1. ~~Book list UI with search~~ (done)
2. ~~Month-based filtering + "What Should I Read Now?"~~ (done)
3. ~~Manual vibe tagging UI~~ (done — book_vibes table + VibeEditor component)
4. ~~AI-assisted vibe tagging via Claude API~~ (done — tag-vibes.ts script + AI badge UI)

**Post-MVP roadmap:**

### Phase 5: Canonical Vibes & Vibes Discovery

Two-tier vibe system: 17 canonical vibes for browsing/filtering + freeform descriptive vibes for richness. Canonical vibes are the primary discovery axis; freeform vibes remain visible on book detail and available for future AI-driven search/lists.

**5a. Canonical vibe schema & tagging**
- Add `is_canonical` boolean to `book_vibes` (new migration, defaults to `false`)
- Define the 17 canonical vibes as an app constant:

| Tag | Description |
|-----|-------------|
| Cozy | Comfort reads, warm feelings, low stakes |
| Dark | Grim, unsettling, morally complex |
| Hopeful | Optimistic arc, things get better |
| Melancholy | Beautiful sadness, bittersweet |
| Intense | Can't put it down, high tension |
| Slow Burn | Meditative pace, rewards patience |
| Atmospheric | Setting is a character, immersive world |
| Found Family | Chosen bonds, group dynamics |
| Female Rage | Women's anger as power, cathartic |
| Escapist | Pure fun, don't have to think |
| Emotional Gut-Punch | Will make you cry |
| Epic | Big scope, sweeping narrative |
| Sincere | Earnest emotional investment, anti-ironic, wrestling with meaning |
| Austere | Restrained, precise, intellectual cool, observational distance |
| Demanding | Dense prose, requires surrender, rewards patience |
| Weird | Reality feels wrong, cosmic unease, philosophical dread |
| Transgressive | Pushes boundaries, goes to uncomfortable places |

- New script (or `tag-vibes.ts --canonical` mode) to bulk-assign 1–3 canonical vibes per fiction-list book via Claude API. Prompt includes the 17 tags with descriptions; model must choose only from the list.
- Update `tag-vibes.ts` for future runs to assign both canonical (1–3) + freeform (2–4) vibes per book, with existing freeform vocabulary supplied in the prompt to reduce near-duplicates.

**5b. Vibes discovery page & UI updates**
- `/vibes` route — grid/list of 17 canonical vibes with book counts, click through to filtered book list
- Update manual tagging UI — VibeEditor offers dropdown/autocomplete from the 17 canonical tags (separate from freeform input)
- Add "Vibes" link to header nav alongside "Seasonal"
- Book detail page: canonical vibes displayed prominently; freeform vibes shown separately below

### Phase 6: List View & Filtering

- Metadata filter controls — status, rating, genre, timing month, canonical vibes
- Default view — filter out books without timing data (`timing_raw IS NULL`), with toggle to show all
- More evocative seasonal naming on the home page (replace "Early February" with atmospheric labels)
- List view styling — cover thumbnails (if available), canonical vibe badges on rows

### ~~Phase 7: Book Detail Redesign~~ (done)

- Responsive hero area with optional cover image (left on desktop, stacked on mobile)
- "Personalized" card — Predicted Rating (unread books), Notes
- "Metadata" card — Genre, Category, When to Read, ISBN, dates
- Rating promoted to hero area below status badges
- VibeEditor repositioned between Personalized and Metadata cards

### ~~Phase 8: Data Enrichment via ISBNdb~~ (done)

- `scripts/enrich-isbndb.ts` — bulk enrichment via ISBNdb API (cover images, page count, publisher, publication year, format, synopsis)
- New DB columns: `page_count`, `publisher`, `publication_year`, `format`, `isbndb_enriched_at` (migration 006)
- BookDetail Metadata card displays new fields; cover image + summary auto-render when populated
- --dry-run/--limit/--force flags; 1 req/sec rate limiting; exponential backoff on 429/5xx

### ~~Phase 9: Add Books~~ (done)

- `/add` route — search ISBNdb by title/author or enter ISBN directly, preview metadata, pick status, save to library
- `src/lib/isbndb.ts` — frontend ISBNdb client via Vite dev proxy (`/api/isbndb` → `api2.isbndb.com`)
- ISBN auto-detection skips straight to preview; duplicate warning if ISBN already in library
- RLS INSERT + UPDATE policies on books (migration 007)

### Round 1: Enable Reflection

The core loop: read → reflect → AI understanding deepens → better recommendations and insights → read more intentionally. Round 1 builds the input side of that loop — giving the user ways to tell the app how books make them feel, and giving the AI a place to listen and learn.

~~**Phase 10: Inline Editing on Book Detail**~~ (done)
- Edit rating, notes, status, favorite, up next directly from the book detail page
- Optimistic updates with rollback on error; auto-save for dropdowns/toggles, click-to-edit with save/cancel for text fields
- `src/lib/books.ts` — `updateBook` helper type-constrained to 5 editable fields
- Personalized card always renders (not conditional on existing values)

~~**Phase 11: AI Reading Companion**~~ (done)
- Single chat interface at `/chat` for discussing your whole reading life — not per-book threads
- Persisted conversation history (`conversations` + `messages` tables in Supabase)
- AI has full library context (books, ratings, vibes) via system prompt with prompt caching
- Claude memory tool (`memory_20250818`) for cross-conversation continuity — stores reader insights in `memory_files` table
- Real-time streaming via SSE; standalone Node.js server on port 3001, proxied through Vite dev server
- Session persistence via sessionStorage; conversation list with auto-generated titles
- Note: memory tool integration bridges Phase 11 and Phase 12 — the AI can already begin building reader understanding

~~**Phase 12: Reader Profile**~~ (done)
- `reader_profile` table stores periodic AI-generated profiles (each generation inserts a new row, history preserved)
- `scripts/generate-profile.ts` synthesizes library data, memory files, and conversation history into structured profile via Claude Opus
- Profile sections: reader identity, thematic pillars, taste evolution (with shift log), emotional patterns, reading life snapshot, personal canon
- Profile included in chat system prompt via `server/profile-loader.ts` (cached 10min)
- `/profile` page displays all sections; Personal Canon is the only user-editable section (add/remove books via library search modal)
- Shift log and personal canon carry forward across regenerations
- --dry-run, --force, --bootstrap flags; monthly cadence (manual script runs)

### Round 2: AI-Driven Output

With the reflection loop feeding signal, the AI can start producing personalized value.

~~**Phase 13: Predicted Ratings**~~ (done)
- Replaced editorial `transformative_potential` and `canon_potential` text fields with AI-generated `predicted_rating` (numeric 0.5–5.0)
- `scripts/predict-ratings.ts` generates predictions via Claude Sonnet 4.5 using reader profile, personal canon, and stratified calibration set
- Predictions shown on BookDetail for unread books only; hidden for read/reading/unfinished
- Batches of 20, --dry-run/--limit/--force flags; requires reader profile + ≥10 rated books
- Migration 010 drops old columns and adds `predicted_rating` + `predicted_at`

~~**Phase 14a: Lists & Curation (Manual)**~~ (done)
- `lists` + `list_items` tables with ordered positions, cascade deletes, RLS (migration 011)
- `/lists` index page with create form, `/lists/:id` detail with ordered books
- Add/remove books via library search, reorder up/down, inline-edit name/description, delete list
- `src/lib/lists.ts` CRUD module (9 functions)

**Phase 14b: Lists & Curation (AI Generation)**
- AI-generated lists using vibes, metadata, and reader profile ("books in your library for when you feel like this," "you've been reading a lot of cold autofiction — here's something more hopeful")
- AI can generate lists proactively based on reading patterns, or on request via chat companion

**Phase 15: Home Page Redesign**
- Transform `/` from a filtered book list into a personalized library landing page
- Currently-reading book, seasonal picks, recently added, AI-curated suggestions
- Contextual greeting from the AI grounded in real conversational context (e.g., "How's Project Hail Mary going? You were really moved after your last session.")
- Current book list view moves to `/library` or `/browse`

### Round 3: Discovery & New Releases

Extends the personalization loop beyond books already in the library.

**Phase 16: New Releases Ingestion**
- Data source for weekly/monthly book releases (ISBNdb, Google Books API, publishing calendars — evaluate options at implementation time)
- Store release data separately from the user's library
- Browse interface for new and upcoming books

**Phase 17: Personalized New Release Filtering**
- AI uses reader profile to surface the books from each week's/month's releases most likely to resonate
- Curated "To Buy" list with explanations for why each book was recommended
- Replaces the manual workflow of checking Kirkus, Goodreads, BookBrowse, etc.

**Phase 18: Wishlist & Want-to-Read**
- "Want to read" status for books not yet owned
- Books surfaced through discovery can be saved to wishlist
- Data model implications: books table may need "owned" vs "wishlisted" concept
- Potential integration with bookstore APIs for purchase links

### Round 4: Library as a Space

Making the library joyful to visit — a space that reflects the reader's personality.

**Phase 19: Visual Bookshelf View**
- Alternative to list view: cover images or book spine graphics
- Toggle between list view and visual bookshelf view
- Design exploration: what makes a digital bookshelf feel warm and personal (not just a grid of thumbnails)

**Phase 20: Customizable Shelving**
- User-defined shelf groupings — by genre, literary movement, award winners, mood, or any criteria
- Drag-and-drop or assign-to-shelf organization
- Shelves are visual collections within the bookshelf view
- Reflects how readers physically reshelf books based on current thinking

**Phase 21: UI Polish & Refinements**
- Default view improvements (hide books without timing data, better defaults)
- List view styling refinements
- Book detail page iterations based on usage
- General polish across all existing features

### Deferred

- **Reviews integration** — "What Others Are Saying" section on book detail. Critical sources (NYT, New Yorker, Kirkus, etc.) and reader reviews (Goodreads, StoryGraph, etc.) lack reliable public APIs. Revisit when a viable data source emerges.
- **Social & sharing** — shared lists, customizable library profiles, shared shelf templates. Requires authentication, multi-user data isolation, and hosting. Keep in mind architecturally but don't build toward yet.
- **Hosting** — Vercel/Netlify/Cloudflare Pages for static frontend + serverless proxy for ISBNdb. Decide when there's a reason to access the app outside localhost.

## Data Model

Eight tables in Supabase:

**books** — 1,711 rows. Key fields beyond the obvious:
- `timing_month` (1-12), `timing_position` (early/mid/late), `timing_raw` — seasonal reading data from the fiction spreadsheet. ~917 books have timing; ~794 catalog-only books have nulls.
- `predicted_rating` — AI-predicted rating (0.5–5.0), generated by `predict-ratings.ts` based on reader profile
- `predicted_at` — timestamp of last prediction (null = never predicted)
- `rating` — numeric 0-5 in 0.5 increments; null means unrated (catalog stored 0.0 for unrated)
- `status` — read, unread, reading, unfinished (lowercased from catalog)
- `is_favorite`, `is_up_next` — booleans from catalog flags
- `page_count`, `publisher`, `publication_year`, `format` — enriched from ISBNdb
- `isbndb_enriched_at` — timestamp of last ISBNdb lookup (null = not yet looked up; set even for 404s to prevent retries)

**book_vibes** — Vibe tags for books. Each row links a vibe string to a book. Key fields:
- `ai_assigned` / `user_confirmed` — tracks provenance; AI vibes start unconfirmed, users can confirm in the UI
- `is_canonical` (planned) — distinguishes the 17 canonical vibes used for browsing/filtering from freeform descriptive vibes. Canonical vibes are the primary discovery axis; freeform vibes provide richness for detail pages and future AI search.

**conversations** — Chat conversations. Key fields:
- `title` — AI-generated after first exchange (3-6 words)
- `archived_at` — null means active; set to archive

**messages** — Chat messages within conversations. Key fields:
- `conversation_id` — FK to conversations, CASCADE delete
- `role` — 'user' or 'assistant'
- `content` — message text

**memory_files** — Persistent memory for the AI reading companion (Claude memory tool). Key fields:
- `path` (PK) — virtual file path, must start with `/memories/`
- `content` — file contents, managed by Claude via memory tool commands
- `updated_at` — auto-updated via trigger

**reader_profile** — Periodic AI-generated reader profiles. Each generation inserts a new row; latest fetched with `ORDER BY generated_at DESC LIMIT 1`. Key fields:
- `generated_at` — when this profile was generated
- `profile_data` (jsonb) — structured profile: reader_identity, thematic_pillars, taste_evolution, emotional_patterns, reading_life_snapshot, personal_canon
- `generation_context` (jsonb) — metadata: model, book count, message count, token usage

**lists** — User-created curated book lists. Key fields:
- `name` — required, non-empty
- `description` — optional
- `updated_at` — auto-updated via trigger

**list_items** — Ordered book references within lists. Key fields:
- `list_id` — FK to lists, CASCADE delete
- `book_id` — FK to books, CASCADE delete
- `position` — dense 1-based integer, renormalized on every mutation
- `UNIQUE (list_id, book_id)` — prevents duplicate books in a list

## Data Import Quirks

The import script (`scripts/import-books.ts`) handles several non-obvious data issues:

- **Title normalization:** Catalog stores trailing articles (`"Da Vinci Code, The"` → `"The Da Vinci Code"`). Regex anchored to end so titles with internal commas (e.g. `"1,000 Places..."`) are safe.
- **Match key:** lowercase, `&`→`and`, smart quotes→ASCII, strip periods and punctuation, strip author parentheticals like `(as Richard Bachman)`, take first author from comma-separated catalog authors.
- **"When to Read" parser:** 5 tiers — clean `"April (early)"`, range `"November (mid to late)"` → takes first position, oddball `"October (Halloween)"` → hardcoded to late, cross-month `"August into September"` → first month only, month-only `"August"`.
- **Notes merging:** When a book appears in both files, catalog notes come first, fiction notes after a `\n\n---\n\n` separator.

## Environment

Requires `.env` (not committed) with:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (service role, not anon — bypasses RLS for bulk import)
- `ANTHROPIC_API_KEY` — for AI vibe tagging script
- `ISBNDB_API_KEY` — for ISBNdb book data enrichment (Phase 8+)
- `VITE_SUPABASE_URL` — same Supabase URL (exposed to browser via Vite)
- `VITE_SUPABASE_ANON_KEY` — anon key (respects RLS, safe for browser)
- `VITE_ISBNDB_API_KEY` — ISBNdb key for frontend Add Book search (proxied via Vite dev server)

## Code Style

- Strict TypeScript, ESM imports
- Frontend: Vite + React + Tailwind v4 + shadcn/ui (New York style, neutral palette)
- `@/*` path alias maps to `src/*`
- shadcn/ui components live in `src/components/ui/`
