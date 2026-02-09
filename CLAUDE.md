# MoodLib

A book library app that recommends books based on mood, season, and vibe. AI-powered reading companion that learns your taste and deepens your reading life.

## Vision

MoodLib exists because most book apps and communities have drifted toward social performance and goal-chasing — read counts, public ratings, challenges completed — at the expense of actually reading meaningfully. MoodLib is the antidote: an app that helps readers understand how books affect them, and uses that understanding to guide what they read next.

The app's central loop is: **read → reflect → AI understanding deepens → better recommendations and insights → read more intentionally**. Ratings and notes alone don't capture why a book resonated. The AI reading companion is the mechanism for deeper reflection — a place to discuss what you're reading, how it's making you feel, and how it connects to other books and ideas. Over time, the AI builds a reader profile that enables genuinely personal recommendations, predicted ratings, and proactive suggestions grounded in the reader's evolving tastes.

Everything should feel personal. The app should celebrate the reader's own library and make them excited to "step into" it — not replicate a public review site or bookstore.

**Product direction:** MoodLib is being built as a public web application (and eventually mobile). The current development phase uses a single library to get the experience right before adding authentication, multi-user data isolation, and hosting. Features should be evaluated as product decisions — "would this be valuable to readers?" — not just personal utility.

## Commands

```bash
npm install                          # install dependencies
npm run dev                          # start Vite dev server
npm run build                        # production build → dist/
npm run preview                      # preview production build
npx tsx scripts/import-books.ts      # import CSV data into Supabase (destructive — re-inserts all rows)
npx tsx scripts/tag-vibes.ts         # AI canonical vibe tagging (17 tags only)
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
npx tsx scripts/ingest-releases.ts             # ingest new releases from ISBNdb (3-month window)
npx tsx scripts/ingest-releases.ts --dry-run   # preview API calls and counts, no DB writes
npx tsx scripts/ingest-releases.ts --limit 50  # cap total releases upserted
npx tsx scripts/ingest-releases.ts --month 2026-03  # query a single specific month
npx tsx scripts/ingest-releases.ts --months 6  # adjust window size (default 3)
npx tsx scripts/ingest-releases.ts --language en  # English-language books only
npx tsx scripts/ingest-releases.ts --binding hardcover  # hardcover binding only
npx tsx scripts/ingest-releases.ts --fiction   # fiction genres only (subject-based filter)
npx tsx scripts/score-releases.ts              # AI score releases for current month
npx tsx scripts/score-releases.ts --dry-run    # preview prompt, no API calls or DB writes
npx tsx scripts/score-releases.ts --limit 10   # process only first 10 releases
npx tsx scripts/score-releases.ts --month 2026-02  # score a specific month
npx tsx scripts/score-releases.ts --force      # re-score already-scored releases
npx tsx scripts/reclassify-genres.ts              # generate genre-review.json via Claude API
npx tsx scripts/reclassify-genres.ts --dry-run    # list books to process, no API calls
npx tsx scripts/reclassify-genres.ts --limit 20   # process first 20 books only
npx tsx scripts/reclassify-genres.ts --force      # re-classify ALL books (even clean ones)
npx tsx scripts/reclassify-genres.ts --output my.json  # custom output filename
npx tsx scripts/reclassify-genres.ts --apply genre-review.json  # apply review file to DB
npx tsx scripts/tag-classifications.ts            # AI classification tagging for nonfiction + poetry
npx tsx scripts/tag-classifications.ts --dry-run  # preview prompts, no API calls or DB writes
npx tsx scripts/tag-classifications.ts --limit 10 # process only first 10 books per type
npx tsx scripts/tag-classifications.ts --force    # re-tag books that already have AI classifications
npx tsx scripts/tag-classifications.ts --nonfiction  # nonfiction only (topics/form/depth)
npx tsx scripts/tag-classifications.ts --poetry      # poetry only (movement/formal_feel/accessibility)
npx tsx scripts/ingest-awards.ts               # ingest literary awards from Wikidata + match to library
npx tsx scripts/ingest-awards.ts --dry-run     # preview queries and counts, no DB writes
npx tsx scripts/ingest-awards.ts --match-only  # skip Wikidata, only re-run library matching
npx tsx scripts/ingest-awards.ts --force       # re-fetch all from Wikidata (default skips existing)
npx tsx scripts/ingest-awards.ts --limit 5     # process only first N awards
```

Dev workflow requires two terminals: `npm run dev` (Vite, port 5173) + `npm run dev:server` (chat API, port 3001). Vite proxies `/api/chat` to the chat server.

SQL migrations (`supabase/migrations/`) are run manually in the Supabase SQL Editor, not via CLI.

## Git Workflow

Always follow this sequence when making code changes:

1. **Branch** — Create a new branch from `main` before writing any code (`git checkout -b descriptive-branch-name`)
2. **Code** — Make the changes
3. **Verify** — Run `npm run build` to confirm no type errors or build failures
4. **Commit** — Stage and commit with a clear message
5. **Push** — Push the branch to origin (`git push -u origin branch-name`)

Never commit directly to `main`. Each task or bug fix gets its own branch.

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
- `src/App.tsx` — React Router: `/` (Home), `/library` (BookList), `/add` (AddBook), `/books/:id` (BookDetail), `/syllabi` (SyllabiPage), `/syllabi/:id` (SyllabusDetail), `/releases` (ReleasesPage), `/profile` (Profile)
- `src/components/Layout.tsx` — App shell with header + `<Outlet />`, wraps all routes in ChatProvider
- `src/pages/BookList.tsx` — Debounced search, pagination via Supabase `.range()`
- `src/pages/BookDetail.tsx` — Full book metadata display with inline editing (status, rating, favorite, notes) + predicted rating display + "Discuss this book" chat trigger
- `src/lib/supabase.ts` — Supabase client (uses `VITE_SUPABASE_ANON_KEY`)
- `src/lib/books.ts` — Book update helper (type-constrained to editable fields)
- `src/lib/vibes.ts` — Vibe CRUD operations (fetch, add, remove, confirm)
- `src/components/VibeEditor.tsx` — Inline vibe editor with AI badge styling and confirm/remove actions
- `src/pages/AddBook.tsx` — ISBNdb search, preview, and add-to-library flow
- `src/lib/isbndb.ts` — ISBNdb API client (search, lookup, ISBN detection, field mapping)
- `src/components/ui/` — shadcn/ui components (Badge, Card, Input, Select, Separator, Textarea)
- `src/hooks/useChatSession.ts` — Chat state machine (shared between full page and floating panel)
- `src/contexts/ChatContext.tsx` — React context: chat session + panel open/close state
- `src/pages/Chat.tsx` — Full-page AI reading companion chat (consumes shared ChatContext)
- `src/components/ChatPanel.tsx` — Floating chat panel + FAB button (accessible from every page, auto-hides on /chat)
- `src/lib/chat.ts` — Conversation CRUD + SSE streaming client
- `src/components/ChatMessage.tsx` — Chat message bubble component (user/assistant)
- `src/components/ConversationList.tsx` — Past conversations panel (collapsible)
- `server/index.ts` — Chat API server (Node.js HTTP, Claude streaming + memory/list tool loop + web search/fetch server tools, port 3001)
- `server/library-index.ts` — Builds compact library index for system prompt (cached 10min)
- `server/memory-handler.ts` — Memory tool command executor against Supabase memory_files table
- `server/syllabus-handler.ts` — Syllabus tool command executor (create, view, add_books, remove_books, delete) with rationale support
- `server/wishlist-handler.ts` — Wishlist tool command executor (add, view, remove)
- `server/syllabus-index.ts` — Builds existing-syllabi context for system prompt (cached 10min, handles external items)
- `server/excerpt-handler.ts` — Excerpt tool command executor (save, view)
- `server/book-handler.ts` — Book tool command executor (update_status, update_rating, toggle_favorite, delete)
- `server/releases-handler.ts` — Releases tool command executor (browse, top, search)
- `server/profile-scheduler.ts` — Activity-gated monthly profile regeneration (daily check, spawns generate-profile.ts)
- `scripts/tag-vibes.ts` — Bulk AI canonical vibe tagging script (17 fiction vibes, batches of 5, retries, --dry-run/--limit/--force flags)
- `scripts/tag-classifications.ts` — AI classification tagging for nonfiction (topics/form/depth) and poetry (movement/formal_feel/accessibility), same batch architecture
- `src/pages/Profile.tsx` — Reader profile page with editable Personal Canon
- `src/lib/profile.ts` — Profile CRUD + personal canon updates
- `src/components/BookSearchModal.tsx` — Library search modal for canon editing
- `src/components/PersonalCanonEditor.tsx` — Canon grid with add/remove
- `server/profile-loader.ts` — Cached profile loader for chat system prompt (10min TTL)
- `scripts/generate-profile.ts` — Claude-powered reader profile generation (monthly, opus model)
- `scripts/predict-ratings.ts` — AI predicted rating generation for unread books (batches of 20, Sonnet 4.5, --dry-run/--limit/--force flags)
- `scripts/enrich-isbndb.ts` — Bulk ISBNdb enrichment script (1 req/sec, retries, --dry-run/--limit/--force flags)
- `src/pages/SyllabiPage.tsx` — Syllabi course catalog index with editorial card layout
- `src/pages/SyllabusDetail.tsx` — Numbered editorial syllabus detail with inline rationale editing, external book support
- `src/components/SyllabusSearchModal.tsx` — Dual-search modal (library + ISBNdb) for adding items to syllabi
- `src/lib/lists.ts` — Syllabus CRUD operations (create, update, delete, add/remove/reorder items, rationale, external items)
- `src/pages/Home.tsx` — Personalized home page with greeting, currently reading, suggestions, recent additions, library stats
- `src/lib/home.ts` — Home page data queries (currently reading, AI suggestions, recent additions, library stats, greeting)
- `src/components/BookCover.tsx` — Cover image with styled placeholder fallback (sm/lg sizes)
- `src/components/DonutChart.tsx` — Pure SVG donut chart for library stats
- `server/greeting-handler.ts` — AI greeting generation via Claude API with 1hr cache
- `src/pages/ReleasesPage.tsx` — New releases browse page with month selector, score badges, sort toggle, rationale display, dismiss, pagination
- `src/lib/releases.ts` — Release query functions (by month, available months, library ISBN cross-reference, dismiss/undismiss)
- `scripts/ingest-releases.ts` — ISBNdb new releases ingestion script (paginated search, batch upsert, pub_month validation, --dry-run/--limit/--month/--months flags)
- `scripts/score-releases.ts` — AI release scoring script (general signal + personal match, batches of 10, Sonnet 4.5, --dry-run/--limit/--month/--force flags)
- `scripts/reclassify-genres.ts` — AI genre reclassification script (two-phase: generate review JSON → apply to DB, 29-genre taxonomy, batches of 20, Sonnet 4.5, --dry-run/--limit/--force/--output/--apply flags)
- `scripts/ingest-awards.ts` — Wikidata SPARQL ingestion of literary awards (17 awards, 4 query patterns) + library matching (--dry-run/--match-only/--force/--limit flags)
- `src/lib/awards.ts` — Award queries for book detail (join award_entries + literary_awards)
- `src/components/ShelvesView.tsx` — Shelf index with cards + create form (manual and auto shelves)
- `src/components/ShelfCarousel.tsx` — Full-screen immersive coverflow carousel for browsing books within a shelf
- `src/components/ShelfFilterBuilder.tsx` — Filter controls for auto shelf rules (status, genre, rating, month, vibes, favorites)
- `src/lib/shelves.ts` — Shelf CRUD + auto filter query builder + shelf item management

### What's Built

**Foundation** — Searchable/paginated book library, seasonal filtering, vibe system (17 AI-assigned canonical tags + user-created custom tags), book detail with inline editing, ISBNdb enrichment pipeline, add books via ISBNdb search, AI genre reclassification (29-genre taxonomy), ISBN discovery for books without ISBNs

**Reflection Loop** — AI reading companion chat (streaming, memory, tool use with book management + releases search + web search/fetch), floating chat panel accessible from every page, reader profile generation (monthly, activity-gated via snapshot delta checking), conversation excerpts saved to book detail pages

**AI Output** — Predicted ratings for unread books, AI-managed syllabi + wishlist via chat tools, personalized home page with AI greeting, personalized recommendations page

**Discovery** — New releases ingestion from ISBNdb + AI scoring (general signal + personal match), releases browse page with inline detail, wishlist integration from releases, literary awards via Wikidata (17 awards, winner/shortlist/longlist/nominee)

**Library as Space** — Visual bookshelf with manual + auto shelves, coverflow carousel, Bookshop.org purchase links

### Active & Upcoming

**UI Polish** — Reader profile page redesign, vibes page visual refresh, list view styling, general polish across existing features

**Infrastructure** — User authentication + multi-user data isolation, deployment (Vercel/Cloudflare Pages + serverless), public signup

**Future** — Reviews integration (blocked on viable API sources), social features (shared lists/shelves/profiles), mobile application

## Data Model

Fourteen tables in Supabase:

**books** — 1,711 rows. Key fields beyond the obvious:
- `timing_month` (1-12), `timing_position` (early/mid/late), `timing_raw` — seasonal reading data from the fiction spreadsheet. ~917 books have timing; ~794 catalog-only books have nulls.
- `predicted_rating` — AI-predicted rating (0.5–5.0), generated by `predict-ratings.ts` based on reader profile
- `predicted_at` — timestamp of last prediction (null = never predicted)
- `book_type` — `fiction`, `nonfiction`, or `poetry` (check-constrained, default `'fiction'`). Backfilled from 29-genre taxonomy; auto-detected from ISBNdb subjects on Add Book.
- `rating` — numeric 0-5 in 0.5 increments; null means unrated (catalog stored 0.0 for unrated)
- `status` — read, unread, reading, unfinished, wishlist (unconstrained text)
- `is_favorite` — boolean from catalog flag
- `is_up_next` — boolean from catalog flag (column retained but no longer surfaced in UI)
- `page_count`, `publisher`, `publication_year`, `format` — enriched from ISBNdb
- `isbndb_enriched_at` — timestamp of last ISBNdb lookup (null = not yet looked up; set even for 404s to prevent retries)

**book_vibes** — Classification tags for books. Each row links a tag string to a book with a category. Key fields:
- `tag_category` — one of: `vibe` (fiction), `topic`/`form`/`depth` (nonfiction), `movement`/`formal_feel`/`accessibility` (poetry). Default `'vibe'`.
- `ai_assigned` / `user_confirmed` — tracks provenance; AI tags start unconfirmed, users can confirm in the UI
- `is_canonical` — distinguishes canonical tags (from `canonical_tags` table) from freeform user tags
- Unique constraint on `(book_id, vibe, tag_category)`

**canonical_tags** — Defines the canonical tag vocabulary across all categories. 57 tags total: 17 fiction vibes, 15 nonfiction topics, 6 forms, 4 depths, 7 poetry movements, 5 formal feels, 3 accessibilities. Key fields:
- `tag` + `tag_category` (unique) — the tag text and its category
- `description` — human-readable explanation shown in tooltips
- `display_order` — controls rendering order within a category

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
- `generation_context` (jsonb) — metadata: model, book count, message count, token usage, `activity_snapshot` (6 counters used by the profile scheduler for delta checking)

**book_excerpts** — AI-curated insights saved from chat conversations to specific books. Key fields:
- `book_id` — FK to books, CASCADE delete
- `conversation_id` — FK to conversations (nullable)
- `content` — polished 1-3 sentence insight

**lists** — User-created syllabi (curated reading collections). UI shows as "Syllabi" but table name unchanged. Key fields:
- `name` — required, non-empty
- `description` — optional
- `updated_at` — auto-updated via trigger

**list_items** — Ordered item references within syllabi (supports both library and external books). Key fields:
- `list_id` — FK to lists, CASCADE delete
- `book_id` — FK to books, SET NULL on delete (nullable — null for external items)
- `position` — dense 1-based integer, renormalized on every mutation
- `rationale` — optional text explaining why the item belongs in the syllabus
- `external_title`, `external_author`, `external_cover_url`, `external_isbn` — metadata for non-library items (populated when `book_id` is null)
- `UNIQUE (list_id, book_id)` — prevents duplicate library books in a syllabus
- `CHECK (book_id IS NOT NULL OR external_title IS NOT NULL)` — every row has either a library book or an external title
- Partial unique index on `(list_id, external_title, external_author) WHERE book_id IS NULL` — prevents duplicate external entries

**new_releases** — Books ingested from ISBNdb for discovery browsing. Key fields:
- `isbn13` (UNIQUE) — enables upsert-safe re-runs
- `authors`, `subjects` — `text[]` arrays preserving ISBNdb structure
- `pub_year`, `pub_month` — parsed from `date_published` for efficient month queries
- `cover_image_url`, `synopsis`, `binding`, `page_count` — display metadata
- `source` — data source identifier (default `isbndb`), for future multi-source support
- `general_signal_score` — AI-scored general notability (1-10, null = unscored)
- `personal_score` — AI-scored personal relevance (1-10, null = unscored or no profile)
- `ai_score` — combined score (weighted: 60% personal + 40% general), used for default sort
- `ai_rationale` — 1-sentence explanation of score
- `scored_at` — timestamp of last scoring (null = never scored)
- `dismissed` — boolean, user can dismiss uninteresting releases (default false)
- No FK to `books` — cross-referenced by ISBN at query time for "In Library" badges

**shelves** — User-created shelf groupings for visual bookshelf view. Key fields:
- `name` — required, non-empty
- `description` — optional
- `shelf_type` — `'manual'` or `'auto'` (check-constrained)
- `filter` (jsonb) — filter rules for auto shelves (status, genre, rating_min, timing_month, vibes, is_favorite); null for manual shelves
- `updated_at` — auto-updated via trigger

**shelf_items** — Ordered book references within manual shelves (structurally identical to `list_items`). Key fields:
- `shelf_id` — FK to shelves, CASCADE delete
- `book_id` — FK to books, CASCADE delete
- `position` — dense 1-based integer, renormalized on every mutation
- `UNIQUE (shelf_id, book_id)` — prevents duplicate books in a shelf

**literary_awards** — Static reference table, 17 rows. Key fields:
- `name` — full award name
- `short_name` — display label for badges (e.g. "Pulitzer", "Booker")
- `category` — `fiction`, `nonfiction`, or `poetry`
- `wikidata_id` (UNIQUE) — Wikidata entity ID for SPARQL queries

**award_entries** — Historical winners/nominees, matched to library books. Key fields:
- `award_id` — FK to literary_awards, CASCADE delete
- `book_id` — FK to books, SET NULL on delete (nullable; set by matching step)
- `title`, `author` — from Wikidata (independent of library book data)
- `year` — award year (nullable for entries without date)
- `status` — `winner`, `shortlist`, `longlist`, or `nominee`
- `wikidata_work_id` — Wikidata entity ID for deduplication

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
- `ISBNDB_API_KEY` — for ISBNdb enrichment, new releases ingestion, and Add Book search
- `VITE_SUPABASE_URL` — same Supabase URL (exposed to browser via Vite)
- `VITE_SUPABASE_ANON_KEY` — anon key (respects RLS, safe for browser)
- `VITE_ISBNDB_API_KEY` — ISBNdb key for frontend Add Book search (proxied via Vite dev server)

## Design Prototyping (Stitch)

Stitch (Google's MCP-based UI design tool) is used for visual prototyping before implementing page redesigns. The workflow:

1. **Generate** — Use `generate_screen_from_text` with a detailed prompt describing the desired layout, typography, colors, and content. Use the existing project ID `3670163361293626826`. Always use `DESKTOP` device type and `GEMINI_3_PRO` model.
2. **Review** — The `list_screens` API is unreliable for detecting new screens. After generating, the user reviews screens in the Stitch browser UI and selects the ones they like.
3. **Handoff** — The user saves the HTML code from selected screens as `.html` files in the project root (e.g. `shelf-index-stitch.html`). Claude reads these files and translates the design patterns into the React/Tailwind codebase.

Do NOT attempt to poll `list_screens` or `get_screen` to retrieve generated results — the user will provide them. Stitch HTML files are design references only and are not part of the app build.

## Documentation Maintenance

When making changes that affect architecture, features, deployment, or user-facing behavior, update the relevant documentation alongside the code:

- **`CLAUDE.md`** — Architecture, data model, commands, file references
- **`README.md`** — Developer setup, project structure, tech stack
- **`docs/product-requirements.md`** — Feature specs, AI integration, deployment architecture, roadmap
- **`docs/user-guide.md`** — End-user feature documentation

Commit doc updates alongside the code changes, not separately.

## Code Style

- Strict TypeScript, ESM imports
- Frontend: Vite + React + Tailwind v4 + shadcn/ui (New York style, neutral palette)
- `@/*` path alias maps to `src/*`
- shadcn/ui components live in `src/components/ui/`
