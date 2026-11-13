# Rekollekt

A book library app that recommends books based on mood, season, and vibe. AI-powered reading companion that learns your taste and deepens your reading life.

## Vision

Rekollekt exists because most book apps and communities have drifted toward social performance and goal-chasing — read counts, public ratings, challenges completed — at the expense of actually reading meaningfully. Rekollekt is the antidote: an app that helps readers understand how books affect them, and uses that understanding to guide what they read next.

The app's central loop is: **read → reflect → AI understanding deepens → better recommendations and insights → read more intentionally**. Ratings and notes alone don't capture why a book resonated. The AI reading companion is the mechanism for deeper reflection — a place to discuss what you're reading, how it's making you feel, and how it connects to other books and ideas. Over time, the AI builds a reader profile that enables genuinely personal recommendations, predicted ratings, and proactive suggestions grounded in the reader's evolving tastes.

Everything should feel personal. The app should celebrate the reader's own library and make them excited to "step into" it — not replicate a public review site or bookstore.

**Product direction:** Rekollekt is a public web application (and eventually mobile). Authentication and multi-user data isolation are in place via Supabase Auth with Row Level Security. The current phase focuses on alpha launch preparation — polishing the experience, onboarding flow, and deployment infrastructure. Features should be evaluated as product decisions — "would this be valuable to readers?" — not just personal utility.

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
npx tsx scripts/tag-vibes.ts --batch            # one Message Batches request at half price (the background job uses this)
npx tsx scripts/tag-vibes.ts --force --limit 100 --model claude-haiku-5-5 --compare out.json  # try another model: new vibes beside the existing ones, nothing saved
npx tsx scripts/enrich-isbndb.ts               # enrich books via ISBNdb (cover images, metadata)
npx tsx scripts/enrich-isbndb.ts --dry-run     # list books that would be enriched, no API calls
npx tsx scripts/enrich-isbndb.ts --limit 10    # process only first 10 books
npx tsx scripts/enrich-isbndb.ts --force       # re-check books already looked up (fills blanks only, never overwrites edits)
npm run dev:server                             # start chat API server (port 3001, auto-restarts; runs background jobs too unless JOBS_IN_WORKER=true)
npm run worker                                 # background worker: every scheduler (profiles, enrichment, review, releases, embeddings)
npx tsx scripts/generate-profile.ts            # generate reader profile via Claude API
npx tsx scripts/generate-profile.ts --dry-run  # preview prompt, no API call or DB write
npx tsx scripts/generate-profile.ts --force    # regenerate even if generated this month
npx tsx scripts/generate-profile.ts --bootstrap # library data only (skip memory + conversations)
npx tsx scripts/predict-ratings.ts             # generate AI predicted ratings for unread books
npx tsx scripts/predict-ratings.ts --dry-run   # preview prompt, no API calls or DB writes
npx tsx scripts/predict-ratings.ts --limit 20  # process only first 20 books
npx tsx scripts/predict-ratings.ts --force     # re-predict books that already have predictions
npx tsx scripts/predict-ratings.ts --user-id <uuid> --batch  # one reader, through the Batch API at half price (the background job uses this)
npx tsx scripts/ingest-releases.ts             # ingest new releases from ISBNdb (3-month window)
npx tsx scripts/ingest-releases.ts --dry-run   # preview API calls and counts, no DB writes
npx tsx scripts/ingest-releases.ts --limit 50  # cap total releases upserted
npx tsx scripts/ingest-releases.ts --month 2026-03  # query a single specific month
npx tsx scripts/ingest-releases.ts --months 6  # adjust window size (default 3)
npx tsx scripts/ingest-releases.ts --language en  # English-language books only
npx tsx scripts/ingest-releases.ts --binding hardcover  # hardcover binding only
npx tsx scripts/ingest-releases.ts --fiction   # fiction genres only (subject-based filter)
npx tsx scripts/triage-releases.ts --month 2026-11  # drop non-books, reprints, academic etc. before scoring (rules + Haiku 5.5)
npx tsx scripts/triage-releases.ts --month 2026-11 --dry-run --report triage.json  # preview outcomes, no DB writes
npx tsx scripts/triage-releases.ts --month 2026-11 --rules-only --dry-run  # free rules only, no AI calls
npx tsx scripts/triage-releases.ts --month 2026-11 --force  # re-triage releases already triaged
npx tsx scripts/triage-releases.ts --month 2026-11 --redo not_for_general_readers  # re-triage only releases dropped for these reasons (after a rules or prompt change)
npx tsx scripts/score-releases.ts              # AI score releases for current month (triaged and kept only)
npx tsx scripts/score-releases.ts --dry-run    # preview prompt, no API calls or DB writes
npx tsx scripts/score-releases.ts --limit 10   # process only first 10 releases
npx tsx scripts/score-releases.ts --month 2026-02  # score a specific month
npx tsx scripts/score-releases.ts --force      # re-score already-scored releases
npx tsx scripts/score-releases.ts --month 2026-11 --user-id <uuid>  # personal scores for one reader, on notable releases (general 6+) only
npx tsx scripts/score-releases.ts --month 2026-11 --batch --force --limit 150 --batch-size 10 --compare out.json  # check a change: new scores beside the saved ones, nothing saved
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
npx tsx scripts/tag-classifications.ts --batch       # through the Batch API at half price (the background job uses this); --model and --compare as for tag-vibes
npx tsx scripts/ingest-awards.ts               # ingest literary awards from Wikidata + match to library
npx tsx scripts/ingest-awards.ts --dry-run     # preview queries and counts, no DB writes
npx tsx scripts/ingest-awards.ts --match-only  # skip Wikidata, only re-run library matching
npx tsx scripts/ingest-awards.ts --force       # re-fetch all from Wikidata (default skips existing)
npx tsx scripts/ingest-awards.ts --limit 5     # process only first N awards
npx tsx scripts/embed-books.ts                 # embed books with no embedding for their current text (the server also does this every 10 minutes)
npx tsx scripts/embed-books.ts --dry-run       # count pending books and estimate tokens, no API calls
npx tsx scripts/embed-books.ts --limit 50      # embed at most 50 books
npx tsx scripts/grant-subscription.ts user@example.com           # grant complimentary paid subscription
npx tsx scripts/grant-subscription.ts user@example.com --revoke  # revoke back to free tier
```

Dev workflow requires two terminals: `npm run dev` (Vite, port 5173) + `npm run dev:server` (chat API, port 3001). Vite proxies `/api/chat`, `/api/greeting`, and `/api/isbndb` to the chat server.

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
- Stripe (`stripe`) for subscription billing + webhooks (server-side only)
- ESM throughout (`"type": "module"` in package.json)

## Architecture

**Current:** Import pipeline + AI tagging pipeline + chat server + interactive frontend. Two CSV source files are parsed, merged on a normalized title+author key, and batch-inserted into Supabase. The `tag-vibes.ts` script bulk-tags fiction-list books with AI-generated vibes via Claude API. A standalone Node.js server (`server/index.ts`) handles Claude API streaming for the reading companion chat. The React frontend provides a searchable, paginated book list, detail view with vibe editing, seasonal recommendations, and an AI reading companion chat.

**Frontend structure:**
- `src/main.tsx` — React entry point
- `src/App.tsx` — React Router: `/` (LandingPage), `/login` (LoginPage), `/reset-password` (ResetPasswordPage), `/onboarding` (OnboardingPage), `/home` (Home), `/library` (BookList), `/add` (AddBook), `/import` (ImportBooks), `/books/:id` (BookDetail), `/syllabi` (SyllabiPage), `/syllabi/:id` (SyllabusDetail), `/releases` (ReleasesPage), `/profile` (Profile), `/settings` (Settings), `/guide` (GuidePage), `/chat` and `/chat/:id` (Chat), `/admin` (AdminPage, owner only), `/philosophy` (PhilosophyPage), `/features` (FeaturesPage), `/pricing` (PricingPage), `/faq` (FAQPage), `/contact` (ContactPage). Protected routes require auth via OnboardingGate; public pages standalone.
- `src/pages/LandingPage.tsx` — Public landing page (standalone, no sidebar/Layout wrapper)
- `src/pages/LoginPage.tsx` — Login/signup page with email+password and Google OAuth, with the Turnstile check on email sign-up, sign-in, and "Forgot password?" (sends the reset email; `/login?forgot=1` opens it)
- `src/pages/ResetPasswordPage.tsx` — Where the reset email lands: signs the reader in from the link, then sets a new password. Takes the `?token_hash=…&type=recovery` link from Supabase's Reset password email template (works on any device) or Supabase's default `?code=` link (only in the browser that asked, because of PKCE)
- `src/components/Turnstile.tsx` — Cloudflare Turnstile widget for Supabase Auth's captcha protection. Shows nothing until `VITE_TURNSTILE_SITE_KEY` is set
- `src/pages/PhilosophyPage.tsx` — Public editorial essay on Rekollekt's reading philosophy
- `src/pages/FeaturesPage.tsx` — Public features page with sticky-scroll layout
- `src/pages/ContactPage.tsx` — Public contact form page
- `src/pages/PricingPage.tsx` — Public pricing comparison page (Free vs Companion, Stripe checkout integration)
- `src/pages/FAQPage.tsx` — Public FAQ with accordion sections
- `src/pages/OnboardingPage.tsx` — Two-phase onboarding: welcome gate (chat/import/skip) + AI chat to populate library
- `src/pages/ImportBooks.tsx` — Goodreads CSV import: upload, shelf selection, dedup, batch insert with progress
- `src/pages/GuidePage.tsx` — In-app guide page for new users
- `src/pages/AdminPage.tsx` — Owner telemetry page: revenue, profit, and break-even, spend today and this month against the daily stop, daily cost by area, cost by feature and per reader, signups, messages, books added by source, ISBNdb/Voyage/database usage, and background job health. Data from `/api/admin/overview` (the `admin_overview` database function), which only answers for accounts in `ADMIN_USER_IDS`
- `src/pages/Settings.tsx` — Account settings: password reset, library export, subscription management, delete account
- `src/lib/onboarding.ts` — Onboarding status check and completion
- `src/lib/goodreads.ts` — Goodreads CSV parser, shelf detection, field mapping, dedup key generation
- `src/lib/posthog.ts` — PostHog analytics wrapper (init, identify, reset, capture, pageview hook). No-op when VITE_POSTHOG_KEY unset.
- `src/contexts/AuthContext.tsx` — Supabase Auth context with session state + PostHog identify/reset, wraps entire app
- `server/auth.ts` — Server-side auth utilities (`authenticateRequest` checks a login token with Supabase and returns the user and a per-user Supabase client)
- `src/components/Layout.tsx` — App shell with sidebar + `<Outlet />`, wraps protected routes in ChatProvider
- `src/components/Sidebar.tsx` — Collapsible navigation sidebar (Library, Syllabi, Shelves, Recommendations, Releases, Chat, Profile)
- `src/pages/BookList.tsx` — Debounced search, pagination via Supabase `.range()`
- `src/pages/BookDetail.tsx` — Full book metadata display with inline editing (status, rating, favorite, notes) + predicted rating display + "Discuss this book" chat trigger. Section order follows reading status: unread leads with predicted rating and summary, reading with lists and notes, read with notes
- `src/lib/supabase.ts` — Supabase client (uses `VITE_SUPABASE_ANON_KEY`)
- `src/lib/books.ts` — Book update helper (type-constrained to editable fields)
- `src/lib/reading-dates.ts` — Pure reading date logic shared by browser and server: date changes that go with a status change, validation, the reader's local date
- `src/lib/vibes.ts` — Vibe CRUD operations (fetch, add, remove, confirm)
- `src/components/VibeEditor.tsx` — Inline vibe editor with AI badge styling and confirm/remove actions
- `src/pages/AddBook.tsx` — ISBNdb search, edition picker, preview, and add-to-library flow
- `src/components/EditionPicker.tsx` — Edition list with format and language filters (shared by Add Book and Change edition)
- `src/components/BookListsSection.tsx` — "On your lists" section on the book page: the reader's syllabi and reading paths with this book, its position, progress, and focus questions
- `src/components/ReadingDates.tsx` — Start and finish dates on the book page, with inline editing
- `src/components/AlsoByAuthor.tsx` — "Also by" section on the book page: the reader's other books by an author, in-progress and unread first
- `src/components/ChangeEditionModal.tsx` — Switch a library book to another edition from the book page
- `src/components/EditionDetailsForm.tsx` — Inline editor for a book's format, publisher, page count, publication year, ISBN, and cover image URL
- `src/lib/isbndb.ts` — ISBNdb API client (search, lookup, ISBN detection, field mapping) + edition grouping and language/format normalization
- `src/components/ui/` — shadcn/ui components (Badge, Card, Input, Select, Separator, Textarea)
- `src/hooks/useChatSession.ts` — Chat state machine (shared between full page and floating panel)
- `src/contexts/ChatContext.tsx` — React context: chat session + panel open/close state
- `src/contexts/SubscriptionContext.tsx` — Subscription state (plan, limits, isPaid), fetches from /api/subscription
- `src/pages/Chat.tsx` — Full-page AI reading companion chat (consumes shared ChatContext)
- `src/components/ChatPanel.tsx` — Floating chat panel + FAB button (accessible from every page, auto-hides on /chat)
- `src/lib/chat.ts` — Conversation CRUD + SSE streaming client
- `src/components/ChatMessage.tsx` — Chat message bubble component (user/assistant)
- `src/components/ConversationList.tsx` — Past conversations panel on the full chat page (collapsible)
- `src/components/ConversationItems.tsx` — Conversation rows with switch, rename, and delete, used by the full page and the floating panel
- `src/components/ChatEmptyState.tsx` — New conversation screen, with openers based on the book's status and its focus questions
- `src/components/SaveToBook.tsx` — "Save to book" under a chat message, for keeping all or a selected part on a book's page by hand
- `server/index.ts` — Chat API server (Node.js HTTP, Claude streaming + memory/list tool loop, port 3001). The chat prompt is sent as blocks cached separately, least often changed first: instructions (shared by every reader on a plan, with the tools ahead of them), then profile and library, then syllabi, memory, and the date, each with the 1-hour cache; then the book context, then the conversation, cached automatically with the 5-minute cache. Onboarding uses the 5-minute cache throughout. Don't put anything that changes per request ahead of a cached block. The instructions and tools are in `server/chat-prompt.ts`
- `server/chat-prompt.ts` — The chat instructions, the reader context block, and the tools (`chatTools`, a subset for free readers), apart from the request handling so a test can send exactly what the server sends
- `server/library-index.ts` — Builds the library index for the chat system prompt (cached 10min): what the reader is reading, has read, rated, or marked a favorite, plus a summary of the unread books and wishlist, which the AI finds with `search_library`. Onboarding gets every book. Stable ordering keeps the prompt cache valid. Dropped from the cache when the companion changes a book, so its next message sees the change
- `server/library-search.ts` — `search_library` tool executor: the reader's whole library by title/author words, status, tags, and type, sortable by predicted rating; or by meaning (`about`, a description, or `like_title`, books like one in the library) through the `match_books` database function. Results include page counts
- `server/embeddings.ts` — Voyage AI embeddings (`voyage-4`, 1024 dimensions, through MongoDB Atlas): the client, the text a book is embedded from (title, author, type, genre, summary; nothing that differs between readers, so it's shared), and the job that embeds new and changed books every 10 minutes
- `scripts/embed-books.ts` — Embeds every pending book in one go (first fill, or catching up by hand)
- `server/book-lookup.ts` — `findBookByTitle` (punctuation-insensitive match, then contains) and `findOrCreateBook` (title + author + ISBN check against the library, otherwise insert with details from the likeliest ISBNdb edition + auto-link external list items)
- `src/lib/editions.ts` — Pure edition logic shared by browser, server, and scripts: title/author matching, author name parsing ("Last, First", co-authors, credentials), edition grouping and scoring, format and language normalization, field mapping
- `server/memory-handler.ts` — `update_memory` tool executor against the memory_files table (create, append, str_replace, delete; 12,000-character limit across a reader's files), and `loadCoreMemory`, which puts all of a reader's memory in every chat prompt, in the cached block with syllabi and the date
- `server/list-items.ts` — Shared list entry helpers for the syllabus and reading path tools: fetch (library and external items alike), find by title, reorder, insert at a position, remove
- `server/syllabus-handler.ts` — Syllabus tool command executor (create, view, add_books, remove_books, delete, reorder, update_rationale, update_syllabus) with rationale support; auto-adds missing books as wishlist items via findOrCreateBook
- `server/reading-path-handler.ts` — Reading path tool command executor (create_path, view_path, add_path_books, update_progress, get_seminar_content, update_seminar_content, reorder, remove_path_books, update_path, delete_path) with seminar content support; auto-adds missing books as wishlist items via findOrCreateBook
- `server/wishlist-handler.ts` — Wishlist tool command executor (add, view, remove)
- `server/syllabus-index.ts` — Builds existing-syllabi context for system prompt (cached 10min, handles external items)
- `server/excerpt-handler.ts` — Excerpt tool command executor (save, view). In a conversation about a book, saves go to that book
- `server/conversation-history.ts` — What the AI sees of a conversation: every message until the history passes about 20,000 tokens, then a summary of the start (written in the background after a reply, Sonnet 5.5) plus the most recent ~8,000 tokens in full. The reader still sees every message. Each reply goes back with its record of actions
- `server/action-log.ts` — A short record of each change the companion makes with its tools (searches and views aren't recorded), saved with the reply in `messages.actions` and sent back to the AI as an `<actions>` note at the end of that reply, so it knows in later turns what it already did
- `server/book-context.ts` — What the AI gets in a conversation about a book: its status, dates, notes, excerpts, list context, summary, and earlier conversations
- `server/conversation-review.ts` — After a book conversation goes quiet for 30 minutes, saves up to two excerpts and a one-line summary (paid plan, every 10 minutes, Sonnet 5.5), so the companion never announces a save mid-conversation
- `server/subscription.ts` — Plan checks: `isPaidAndActive` (a paying subscriber; past due counts, so a failed renewal doesn't cut access while Stripe retries), `hasCompanion` (that, or anyone during the free launch period, until `FREE_PERIOD_ENDS`, midnight 1 January 2027 Pacific), plus claiming and returning a reader's chat messages (free readers' 5 a month, Companion's fair-use cap of 100) so requests sent together can't pass the limit. Without Companion, chat gets read-only syllabus and reading path tools (`chatTools`, `allowedWithoutCompanion` in `server/chat-prompt.ts`), so readers keep and can discuss lists made while they had it. Subscribing during the free period starts billing when it ends (a Stripe trial)
- `server/request-body.ts` — Reads a request body, refusing anything over 100KB so a huge request can't fill the server's memory
- `server/spend-guard.ts` — The daily stop for chat spending: a running total of today's chat cost (from `chat_token_usage` at startup, then each call as it's logged); past `DAILY_CHAT_BUDGET_USD` (default $25) chat and greetings answer "busy" until 00:00 UTC. Also turns Anthropic spend limits, rate limits, and overload into the same "busy" message
- `server/rate-limit.ts` — Request limits kept in memory: every API request (300 a minute per address), chat (60 per 10 minutes per address, 10 a minute per reader), the contact form (5 an hour), Add Book searches (60 a minute), and curation, checkout, the billing portal, and account deletion (20 an hour). Over a limit: 429 with Retry-After. The Stripe webhook is exempt
- `server/isbndb.ts` — Every ISBNdb call goes through here (Add Book proxy, chat lookups, enrichment, ISBN discovery, release ingestion). The plan allows 5,000 calls a day and 60 a minute; a lookup is charged per ISBN even in bulk, and a search is one call however many books it returns. Lookups check a shared cache of ISBNdb's data (`isbndb_books`), then ingested releases, before calling; misses go 100 ISBNs to a call. Every book a response returns is cached. Each response's remaining quota is kept in `api_quota`, and background lookups stop when 1,000 calls are left for the day (`BACKGROUND_RESERVE`), so Add Book and chat keep working
- `server/worker.ts` — The background worker (also sends alerts and runs the daily Anthropic and Stripe checks), a separate Render service (Background Worker, start command `npx tsx server/worker.ts`) that runs every scheduler, so a job can't slow or crash chat. Polls `release_curation` every minute, since the web server can't start a releases check in another process
- `server/background-jobs.ts` — Starts all the schedulers. The web server calls it unless `JOBS_IN_WORKER=true`; the worker always does
- `server/models.ts` — The chat model ID, shared by the web server and the worker
- `server/usage.ts` — Telemetry recording: `recordUsage`/`recordClaudeUsage` write every paid API call with its cost to `api_usage`, `trackClaudeUsage` wraps a script's Anthropic client so each response is recorded (per reader where known), `usageCost` holds the prices, and `recordJobRun` updates `job_heartbeats`
- `server/alerts.ts` — Email alerts from the worker through Resend, checked every 15 minutes and each sent once per period (`alerts_sent`): AI spend today past `ALERT_DAILY_SPEND_USD` (default $10), chat paused by the daily stop, signups per hour past `ALERT_SIGNUPS_PER_HOUR` (default 20), failing or stalled jobs, ISBNdb at its reserve, Voyage free tokens at 80%/95%, the database at 80% of 8GB, readers at the monthly reply cap, gaps between billed and recorded AI cost, disputed payments, revenue that doesn't match Stripe, a server past 85% of its memory, and the web server not reporting. Plus a daily summary of the day before after 14:00 UTC (`ALERT_DAILY_SUMMARY=false` turns it off)
- `server/cost-reconciliation.ts` — Hourly in the worker: compares the last 3 complete UTC days of Anthropic's bill (Usage and Cost Analytics API, `ANTHROPIC_ADMIN_API_KEY`) with `api_usage`, per workspace matched by name ("chat", "background"/"jobs", anything else "other"; Claude Code workspaces left out), into `cost_reconciliation`
- `server/jobs.ts` — Starts background scripts, at most 2 at a time across all schedulers (each is an ~80-100MB process on a 512MB server)
- `server/book-handler.ts` — Book tool command executor (update_status, update_rating, toggle_favorite, delete). Status changes from chat only set a date the reader gave, so "I read that years ago" doesn't record today
- `server/releases-handler.ts` — Releases tool command executor (browse, top, search)
- `server/onboarding-prompt.ts` — Onboarding-specific system prompt builder (empty library vs. imported library paths)
- `server/profile-scheduler.ts` — Activity-gated monthly profile regeneration (checks every 4 hours, generates one profile at a time, finds new readers from `user_subscriptions`)
- `server/stripe-handler.ts` — Stripe webhook event processing (subscriptions, payments, refunds, disputes; each payment, refund, and dispute also recorded in `billing_events`), checkout/portal session creation. Pinned to API version 2026-01-28.clover, the webhook endpoint's: a subscription's period is on its items, and an invoice's subscription is under `parent.subscription_details`. Change both together
- `server/stripe-reconciliation.ts` — Hourly in the worker: the last 3 UTC days of Stripe's balance (payments less refunds, and fees) against `billing_events`, into `stripe_reconciliation`
- `server/health.ts` — Each server's container memory (scripts it started included) and today's peak, reported to `service_health` every 5 minutes, on Render only
- `src/components/admin/RevenueSection.tsx` — Revenue and profit on the admin page: recurring revenue, profit this month with fixed costs, break-even, each paid reader's margin, recent billing, and the Stripe check
- `scripts/grant-subscription.ts` — Admin script to grant/revoke complimentary paid subscriptions by email
- `scripts/fetch-all.ts` — Reads every row of a query page by page (Supabase returns at most 1,000 per request, with no error)
- `scripts/claude-batch.ts` — `runMessageBatch`: sends a script's requests as one Message Batches request at half price, waits (canceling after an hour, so the next run picks up the rest), and records each result's cost
- `scripts/tag-vibes.ts` — Bulk AI canonical vibe tagging script (17 fiction vibes, 5 books per request, Sonnet 5.5, --dry-run/--limit/--force/--batch flags, --model and --compare for trying another model). Haiku 5.5 was tested in November 2026 and kept Sonnet: see next_steps.md
- `scripts/tag-classifications.ts` — AI classification tagging for nonfiction (topics/form/depth) and poetry (movement/formal_feel/accessibility), same architecture and flags
- `src/pages/Profile.tsx` — Reader profile page with editable Personal Canon
- `src/lib/profile.ts` — Profile CRUD + personal canon updates
- `src/components/BookSearchModal.tsx` — Library search modal for canon editing
- `src/components/ProgressBadge.tsx` — Reading path progress badge (not_started/reading/completed) with click-to-cycle
- `src/components/SeminarSection.tsx` — Expandable seminar content (pre-reading context, focus questions, post-reading prompts) with inline editing
- `src/components/PersonalCanonEditor.tsx` — Canon grid with add/remove
- `server/profile-loader.ts` — Cached profile loader for chat system prompt (10min TTL)
- `scripts/generate-profile.ts` — Claude-powered reader profile generation (monthly, Opus 5.5)
- `scripts/predict-ratings.ts` — AI predicted rating generation for unread books (20 books per request, Sonnet 5.5, the reader's profile cached across requests, --dry-run/--limit/--force/--batch flags)
- `scripts/enrich-isbndb.ts` — Bulk ISBNdb enrichment script (1 req/sec, retries, --dry-run/--limit/--force flags)
- `src/pages/SyllabiPage.tsx` — Syllabi course catalog index with editorial card layout
- `src/pages/SyllabusDetail.tsx` — Numbered editorial syllabus detail with inline rationale editing, external book support
- `src/components/SyllabusSearchModal.tsx` — Dual-search modal (library + ISBNdb) for adding items to syllabi
- `src/lib/lists.ts` — Syllabus/reading path CRUD operations (create, update, delete, add/remove/reorder items, rationale, external items, seminar content, progress tracking, auto-link external items to library books)
- `src/pages/Home.tsx` — Personalized home page with greeting, currently reading, suggestions, recent additions, library stats
- `src/lib/home.ts` — Home page data queries (currently reading, AI suggestions, recent additions, library stats, greeting)
- `src/components/BookCover.tsx` — Cover image with styled placeholder fallback (sm/lg sizes)
- `src/components/DonutChart.tsx` — Pure SVG donut chart for library stats
- `server/greeting-handler.ts` — The home page greeting (Sonnet 5.5, low effort): about one current thing, a book being read, one just finished, or the latest conversation, written from the reader's local date and hour (the `X-Reader-Time` header). The profile's reader identity is given for tone only. Greetings are kept in `reader_greetings`: the latest is reused for an hour, and the last few are shown so a new one picks another subject
- `src/pages/ReleasesPage.tsx` — New releases browse page with month selector, Recommended view (the reader's personal picks, after they ask with "Curate for me") and Notable view (general score 6+), score badges, rationale display, dismiss, pagination
- `src/lib/releases.ts` — Release query functions (Recommended and Notable lists by month, available months with notable counts via the `release_month_counts` database function (migration 030), library ISBN cross-reference, dismiss/undismiss, curation request and visit tracking)
- `scripts/ingest-releases.ts` — ISBNdb new releases ingestion script (paginated search, batch upsert, pub_month validation, --dry-run/--limit/--month/--months flags)
- `scripts/triage-releases.ts` — Triages a month of releases before scoring: free rules (non-book formats, academic publishers, children's/education subjects, activity books, special editions, very short books, other formats of the same book) then a Haiku 5.5 check on the listing (new / reprint / not for general readers). Sets `triaged_at` and `skip_reason`. Drops about 60% of a month
- `src/lib/release-scoring.ts` — `scorableOnly` (which releases get general scores) and `personallyScorableOnly` (which get personal scores: general score of `NOTABLE_MIN_GENERAL`, 6, or more), shared by the scorer and the releases scheduler so they agree on what's left to do
- `server/releases-scheduler.ts` — Every 4 hours: imports any target month with no releases (current month, plus next month from the 25th), then per month triages, gives general scores, and gives personal scores on notable releases to each reader who asked for curation and visited Releases in the last 60 days. Starts the next job as soon as one finishes, and right away when a reader asks (`POST /api/releases/curate`). `planReleasesJob` decides the next job and only reads
- `scripts/score-releases.ts` — AI release scoring script (general signal + personal match, 25 releases per request, Sonnet 5.5, the system prompt cached so a reader's profile is paid for once a run, --dry-run/--limit/--month/--force/--batch flags, --batch-size and --compare for checking a change)
- `scripts/reclassify-genres.ts` — AI genre reclassification script (two-phase: generate review JSON → apply to DB, 29-genre taxonomy, batches of 20, Sonnet 5.5, --dry-run/--limit/--force/--output/--apply flags)
- `scripts/ingest-awards.ts` — Wikidata SPARQL ingestion of literary awards (17 awards, 4 query patterns) + library matching (--dry-run/--match-only/--force/--limit flags)
- `src/lib/awards.ts` — Award queries for book detail (join award_entries + literary_awards)
- `src/components/ShelvesView.tsx` — Shelf index with cards + create form (manual and auto shelves)
- `src/components/ShelfCarousel.tsx` — Full-screen immersive coverflow carousel for browsing books within a shelf
- `src/components/ShelfFilterBuilder.tsx` — Filter controls for auto shelf rules (status, genre, rating, month, vibes, favorites)
- `src/lib/shelves.ts` — Shelf CRUD + auto filter query builder + shelf item management

### What's Built

**Foundation** — Searchable/paginated book library, seasonal filtering, vibe system (17 AI-assigned canonical tags + user-created custom tags), book detail with inline editing, ISBNdb enrichment pipeline, add books via ISBNdb search with an edition picker, change edition and edit edition details on the book page, author links and an "Also by" section on the book page, editable reading dates, library filter by author, AI genre reclassification (29-genre taxonomy), ISBN discovery for books without ISBNs

**Reflection Loop** — AI reading companion chat (streaming, memory, tool use with book management + releases search), floating chat panel accessible from every page, reader profile generation (monthly, activity-gated via snapshot delta checking), conversations linked to books with that book's context for the AI, excerpts saved to book pages by hand or automatically after a book conversation

**AI Output** — Predicted ratings for unread books, AI-managed syllabi + reading paths + wishlist via chat tools (books not in library are auto-added as wishlist items), personalized home page with AI greeting, personalized recommendations page, reading paths with seminar-style scaffolding (thesis, pre-reading context, focus questions, post-reading prompts, progress tracking)

**Discovery** — New releases ingestion from ISBNdb + triage (rules and a Haiku check drop non-books, reprints, and academic titles before scoring) + AI scoring (general signal + personal match), releases browse page with inline detail, wishlist integration from releases, literary awards via Wikidata (17 awards, winner/shortlist/longlist/nominee)

**Library as Space** — Visual bookshelf with manual + auto shelves, coverflow carousel, Bookshop.org purchase links

**Public Presence** — Public landing page at `/` with editorial design, brand tagline, value proposition, and feature highlights. Philosophy, features, pricing, FAQ, and contact pages. Personalized home at `/home`.

**Auth & Multi-User** — Supabase Auth with email+password and Google OAuth, RLS policies on all tables, user-scoped queries throughout, JWT-verified server endpoints, login/signup UI

**Onboarding** — Two-phase flow: welcome gate (chat, Goodreads import, or skip) + AI chat that populates library through conversation. Onboarding gate redirects new users until complete. Goodreads CSV import with shelf selection, duplicate detection, and batch insert.

**Monetization** — Stripe-based subscription (free tier: 5 chat messages/month + full library; paid: $7/month or $60/year for chat up to a fair-use cap of 100 replies a month + syllabi + reading paths + automatic excerpts; saving by hand is free). Stripe Checkout + Customer Portal, webhook handler for subscription lifecycle, chat message gating, tool filtering for free users, subscription context + UI (message counters, lock icons, upgrade CTAs), public pricing + FAQ pages, subscription management in Settings. Admin script for granting complimentary subscriptions.

**Analytics** — PostHog client-side integration tracking pageviews, auth events, onboarding funnel, chat engagement, book additions, imports, releases, checkout, and shelf creation. Graceful no-op when key unset.

**Account Management** — Settings page with password reset, library CSV export, subscription management via Stripe Customer Portal, and account deletion with confirmation.

### Future

- Reading Life narrative (AI-identified eras in the reader's journey)
- Social features (shared lists/shelves/profiles)
- Mobile application

## Data Model

Twenty-nine tables in Supabase:

**books** — 1,711 rows. Key fields beyond the obvious:
- `timing_month` (1-12), `timing_position` (early/mid/late), `timing_raw` — seasonal reading data from the fiction spreadsheet. ~917 books have timing; ~794 catalog-only books have nulls.
- `predicted_rating` — AI-predicted rating (0.5–5.0), generated by `predict-ratings.ts` based on reader profile
- `predicted_at` — timestamp of last prediction (null = never predicted)
- `book_type` — `fiction`, `nonfiction`, or `poetry` (check-constrained, default `'fiction'`). Backfilled from 29-genre taxonomy; auto-detected from ISBNdb subjects on Add Book.
- `added_via` — how the book came in: `import`, `search` (Add Book), `chat` (the AI, including onboarding and lists), or `release`; null for books added before November 2026
- `rating` — numeric 0-5 in 0.5 increments; null means unrated (catalog stored 0.0 for unrated)
- `status` — read, unread, reading, unfinished, wishlist (unconstrained text)
- `date_started`, `date_finished` — reading dates. The book page and reading path completion fill blanks when the status changes, and undo a date set the same day if the status is changed back. For `unfinished` books, `date_finished` means when the reader stopped
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
- `title` — AI-generated after first exchange (3-6 words), and the reader can rename it
- `archived_at` — null means active; set to archive
- `book_id` — the book it's about, FK to books, SET NULL on delete. Set when a conversation starts from a book page
- `summary` — one line on what it explored, from the review step
- `last_message_at` — latest activity, updated by a trigger on `messages`; the conversation list sorts by it
- `history_summary`, `history_summarized_until` — the condensed start of a long conversation and the time of the last message it covers; the AI gets the summary plus the messages after it (migration 032)
- `needs_review` — set by the same trigger on book-linked conversations, cleared by the review step

**messages** — Chat messages within conversations. Key fields:
- `conversation_id` — FK to conversations, CASCADE delete
- `role` — 'user' or 'assistant'
- `content` — message text
- `actions` (jsonb) — on assistant messages, what the companion did with its tools in that reply: `[{tool, action, result, failed?}]`, from `server/action-log.ts` (migration 037). Null when nothing changed

**memory_files** — Persistent memory for the AI reading companion, loaded into every chat prompt and changed with the `update_memory` tool (a custom tool, not Anthropic's built-in memory tool, which makes the AI check memory before every reply). Key fields:
- `path` (PK) — virtual file path, must start with `/memories/`
- `content` — file contents, managed by Claude via `update_memory`. A reader's files together hold at most 12,000 characters
- `updated_at` — auto-updated via trigger

**text_embeddings** — One vector per distinct text, keyed by `content_hash` (SHA-256 of model, dimensions, and text), so a book in many libraries is embedded once (migration 031). Holds no text and no reader. `embedding` is `halfvec(1024)`. Signed-in readers can read it; only the service role writes.

**book_embeddings** — Links each library book to the vector of its current text: `book_id` (PK, CASCADE delete), `user_id`, `content_hash`. A trigger deletes a book's row when its title, subtitle, author, genre, summary, or type changes, so the embedding job picks it up again. Readers can read their own rows. `match_books(query_embedding, like_book_id, statuses, only_type, match_count)` runs as the caller, so it only searches their books; it scans the reader's books without an index, which is fast at library sizes

**isbndb_books** — Shared cache of ISBNdb's own book data, by ISBN (ISBN-13 where available), filled from every ISBNdb response: lookups, bulk lookups, and search results (migration 033). `data` is ISBNdb's book object, or null for an ISBN it didn't have (looked up again after 90 days). Never holds readers' books, which they can edit. Service role only

**api_usage** — Every paid API call with its cost (migration 034): `provider` (anthropic, voyage, isbndb), `feature` (chat, title, greeting, condense, review, profile, predicted_ratings, vibe_tagging, classification_tagging, genre_reclassify, release_triage, release_scoring, book_embeddings, search_by_meaning, isbndb_lookup, isbndb_search), `model`, `user_id` (the reader it was for, where known), token counts, `calls` (ISBNdb quota charge), `cost_usd`, and `batch`. Chat usage from `chat_token_usage` was copied in; that table is no longer written. Service role only

**job_heartbeats** — Each background job's latest run: `last_run_at`, `last_ok_at`, `last_error`, `runs`, `failures`. Written by every scheduler check and every script run. Service role only

**reader_greetings** — The home page greetings a reader was shown (`greeting`, `created_at`), from `server/greeting-handler.ts`. The latest is reused for an hour across restarts, and the last five from the past two weeks go to the AI so it doesn't repeat itself. Readers can read and add their own (migration 038)

**alerts_sent** — One row per alert email sent, keyed by alert and period (`chat_stop:2026-11-12`, `job_failing:embeddings:2026-11-12`), so each goes out once. Inserting a key by hand silences that alert. Service role only (migration 035)

**cost_reconciliation** — Per UTC day and workspace (`chat`, `jobs`, `other`): what Anthropic billed and what the app recorded. Service role only (migration 035)

**billing_events** — Every payment (positive, with Stripe's fee), refund (negative), dispute, failed payment, and subscription start or end, from the Stripe webhook, keyed by Stripe's id (migration 036). Service role only

**stripe_reconciliation** — Per UTC day: Stripe's balance (payments less refunds), its fees, and what `billing_events` recorded. Service role only

**fixed_costs** — Monthly bills that don't depend on usage (`name`, `monthly_usd`, `notes`; annual bills as a twelfth), for profit and break-even on `/admin`. Edit in the Table Editor. Service role only

**service_health** — Each Render service's latest memory report (`web`, `worker`): container memory, limit, the server process alone, and today's peak. Service role only

**api_quota** — The latest remaining quota a paid API reported, one row per service (`isbndb`: `remaining`, `resets_at`). Service role only

**reader_profile** — Periodic AI-generated reader profiles. Each generation inserts a new row; latest fetched with `ORDER BY generated_at DESC LIMIT 1`. Key fields:
- `generated_at` — when this profile was generated
- `profile_data` (jsonb) — structured profile: reader_identity, thematic_pillars, taste_evolution, emotional_patterns, reading_life_snapshot, personal_canon
- `generation_context` (jsonb) — metadata: model, book count, message count, token usage, `activity_snapshot` (6 counters used by the profile scheduler for delta checking)

**book_excerpts** — What's worth keeping from chat conversations, saved to specific books by the review step, the AI when asked, or the reader by hand. Key fields:
- `book_id` — FK to books, CASCADE delete
- `conversation_id` — FK to conversations, SET NULL on delete, so excerpts outlive their conversation
- `content` — the saved text, usually a polished 1-3 sentence insight

**lists** — User-created syllabi and reading paths. Key fields:
- `name` — required, non-empty
- `description` — optional
- `list_type` — `'syllabus'` or `'reading_path'` (check-constrained, default `'syllabus'`)
- `thesis` — framing thesis for reading paths (null for syllabi)
- `updated_at` — auto-updated via trigger

**list_items** — Ordered item references within syllabi/paths (supports both library and external books). Key fields:
- `list_id` — FK to lists, CASCADE delete
- `book_id` — FK to books, SET NULL on delete (nullable — null for external items). A trigger copies the book's title, author, cover, and ISBN onto the item first, so deleting a book from the library keeps it on its lists with its seminar content and progress (migration 026)
- `position` — dense 1-based integer, renormalized on every mutation
- `rationale` — optional text explaining why the item belongs in the syllabus
- `seminar_content` (jsonb) — for reading path items: `{ pre_reading_context, focus_questions[], post_reading_prompts[] }`
- `path_progress` — `'not_started'`, `'reading'`, or `'completed'` (check-constrained, null for syllabi items)
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
- `triaged_at` — when `triage-releases.ts` triaged it (null = not yet; untriaged releases aren't scored)
- `skip_reason` — why triage dropped it (`format`, `academic_publisher`, `children_or_education`, `activity_book`, `special_edition`, `too_short`, `duplicate_format`, `reprint`, `not_for_general_readers`); null = kept. Dropped releases are hidden on the Releases page and from the chat releases tool (migration 028)
- No FK to `books` — cross-referenced by ISBN at query time for "In Library" badges

**release_curation** — Readers who asked for personal release picks ("Curate for me" on the Releases page), one row per reader (migration 029). Key fields:
- `requested_at` — when they last asked
- `last_visited_at` — when they last opened Releases, recorded at most daily. Curation of new months continues while this is within 60 days
- Readers can read and update their own row; the server writes requests with the service role

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

**user_subscriptions** — Stripe subscription tracking, one row per user. Key fields:
- `user_id` (UNIQUE) — FK to auth.users, CASCADE delete
- `stripe_customer_id`, `stripe_subscription_id` — Stripe identifiers (null for free users)
- `plan` — `free`, `monthly`, or `annual` (check-constrained, default `'free'`)
- `status` — `active`, `trialing`, `past_due`, `canceled`, or `expired`
- `current_period_start`, `current_period_end` — billing period boundaries
- `cancel_at_period_end` — true if user has scheduled cancellation
- `chat_messages_used` — monthly counter, reset on period renewal
- `chat_messages_period_start` — tracks when the counter was last reset
- Auto-created for new users via trigger on `auth.users` insert

## Data Import Quirks

The import script (`scripts/import-books.ts`) handles several non-obvious data issues:

- **Title normalization:** Catalog stores trailing articles (`"Da Vinci Code, The"` → `"The Da Vinci Code"`). Regex anchored to end so titles with internal commas (e.g. `"1,000 Places..."`) are safe.
- **Match key:** lowercase, `&`→`and`, smart quotes→ASCII, strip periods and punctuation, strip author parentheticals like `(as Richard Bachman)`, take first author from comma-separated catalog authors.
- **"When to Read" parser:** 5 tiers — clean `"April (early)"`, range `"November (mid to late)"` → takes first position, oddball `"October (Halloween)"` → hardcoded to late, cross-month `"August into September"` → first month only, month-only `"August"`.
- **Notes merging:** When a book appears in both files, catalog notes come first, fiction notes after a `\n\n---\n\n` separator.

## Environment

Requires `.env` (not committed) with:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (service role, not anon — bypasses RLS for bulk import and scripts)
- `SUPABASE_ANON_KEY` — anon key used by the chat server to create per-user Supabase clients (with RLS)
- `ANTHROPIC_API_KEY` — Claude key for the chat server (chat, greetings, titles), in the Console's chat workspace
- `ANTHROPIC_JOBS_API_KEY` — Claude key for background work (scripts and conversation review), in the Console's jobs workspace, so each has its own spend limit. Falls back to `ANTHROPIC_API_KEY` if unset
- `RESEND_API_KEY`, `ALERT_FROM`, `ALERT_TO` — alert emails through Resend, sent from `alerts@updates.rekollekt.io` (worker only; alerts are off without them). In `.env`, quote `ALERT_FROM` since it has spaces and angle brackets
- `ANTHROPIC_ADMIN_API_KEY` — Anthropic Admin API key for the daily cost check (worker only)
- `ALERT_DAILY_SPEND_USD`, `ALERT_SIGNUPS_PER_HOUR`, `ALERT_DAILY_SUMMARY` — alert thresholds and the daily summary switch (worker, optional). If `DAILY_CHAT_BUDGET_USD` or `PAID_MONTHLY_REPLY_CAP` change on the web service, set the same on the worker so its alerts match
- `ADMIN_USER_IDS` — comma-separated user IDs that can open `/admin` (web service only)
- `JOBS_IN_WORKER` — `true` on the web service once the background worker runs, so the web server leaves the schedulers to it (optional; unset, the web server runs them, as locally)
- `DAILY_CHAT_BUDGET_USD` — daily chat spending stop (optional, default 25)
- `PAID_MONTHLY_REPLY_CAP` — fair-use cap on a paid reader's chat replies a month (optional, default 100)
- `FREE_PERIOD_ENDS` — when the free launch period ends, as an ISO time (optional, default `2027-01-01T08:00:00Z`). Until then every reader has Companion
- `ISBNDB_API_KEY` — for ISBNdb enrichment, new releases ingestion, and Add Book search (server-side only)
- `VOYAGE_AI_API_KEY` — Voyage AI embeddings key, created in MongoDB Atlas (AI Model APIs). Search by meaning is off without it. The account needs a payment method, or it's limited to 3 requests a minute
- `VOYAGE_AI_ENDPOINT` — embeddings host (`ai.mongodb.com`)
- `STRIPE_SECRET_KEY` — Stripe API secret key (server-side only)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `STRIPE_MONTHLY_PRICE_ID` — Stripe Price ID for $7/month plan
- `STRIPE_ANNUAL_PRICE_ID` — Stripe Price ID for $60/year plan
- `VITE_SUPABASE_URL` — same Supabase URL (exposed to browser via Vite)
- `VITE_SUPABASE_ANON_KEY` — anon key (respects RLS, safe for browser)
- `VITE_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key (optional; the captcha is off without it). Its secret key goes in Supabase Auth's captcha setting, not here
- `VITE_POSTHOG_KEY` — PostHog project API key (optional — analytics disabled when unset)
- `VITE_POSTHOG_HOST` — PostHog ingest URL (optional, defaults to `https://us.i.posthog.com`)

## Admin Operations

### Granting complimentary subscriptions

To give a user full paid access without requiring payment (for alpha testers, yourself, or special cases):

```bash
npx tsx scripts/grant-subscription.ts user@example.com
```

This sets the user to an active annual plan with no Stripe IDs and a far-future expiry. Because there are no Stripe IDs on the row, Stripe webhooks will never overwrite it.

To revoke and return a user to the free tier:

```bash
npx tsx scripts/grant-subscription.ts user@example.com --revoke
```

## Design Prototyping (Stitch)

Stitch (Google's MCP-based UI design tool) is used for visual prototyping before implementing page redesigns. The workflow:

1. **Generate** — Use `generate_screen_from_text` with a detailed prompt describing the desired layout, typography, colors, and content. Use the existing project ID `3670163361293626826`. Always use `DESKTOP` device type and `GEMINI_3_PRO` model.
2. **Review** — The `list_screens` API is unreliable for detecting new screens. After generating, the user reviews screens in the Stitch browser UI and selects the ones they like.
3. **Handoff** — The user saves the HTML code from selected screens as `.html` files in the project root (e.g. `shelf-index-stitch.html`). Claude reads these files and translates the design patterns into the React/Tailwind codebase.

Do NOT attempt to poll `list_screens` or `get_screen` to retrieve generated results — the user will provide them. Stitch HTML files are design references only and are not part of the app build.

## Code Style

- Strict TypeScript, ESM imports
- Frontend: Vite + React + Tailwind v4 + shadcn/ui (New York style, neutral palette)
- `@/*` path alias maps to `src/*`
- shadcn/ui components live in `src/components/ui/`
