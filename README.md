# Rekollekt

A personal book library app that recommends books based on mood, season, and vibe. Rekollekt is an AI-powered reading companion that learns your taste and deepens your reading life — built for readers who care more about meaningful engagement with books than read counts and public ratings.

## Overview

Rekollekt's central loop is: **read, reflect, AI understanding deepens, better recommendations and insights, read more intentionally.** The AI reading companion is the mechanism for deeper reflection — a place to discuss what you're reading, how it's making you feel, and how it connects to other books and ideas. Over time, the AI builds a reader profile that enables genuinely personal recommendations, predicted ratings, and proactive suggestions.

### Key Features

- **Personal Library** — Searchable, filterable catalog with inline editing, cover images, and type-aware browsing (fiction/nonfiction/poetry)
- **AI Reading Companion** — Streaming chat with Claude that remembers your preferences, manages your library, creates curated syllabi, and builds reading paths
- **Reader Profile** — AI-generated portrait of your reading identity, thematic pillars, taste evolution, and emotional patterns
- **Predicted Ratings** — AI scores for unread books based on your profile and reading history
- **Syllabi & Reading Paths** — Curated reading collections with per-item rationale, plus AI-generated reading paths with seminar-style scaffolding (thesis, pre-reading context, focus questions, post-reading prompts, progress tracking)
- **Visual Shelves** — Manual and auto-filtered bookshelves with an immersive coverflow carousel
- **New Releases** — AI-scored upcoming books with personal relevance matching
- **Personalized Home** — AI greeting, currently reading, daily suggestions, and reading stats
- **Literary Awards** — Wikidata-sourced award data (17 awards) matched to library books

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (New York style, neutral palette) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| AI | Claude API via `@anthropic-ai/sdk` (Sonnet for chat/scoring, Opus for profiles) |
| Billing | Stripe (subscriptions, checkout, customer portal, webhooks) |
| Analytics | PostHog (`posthog-js`, client-side) |
| Book Data | ISBNdb API (search, enrichment, new releases) |
| Awards Data | Wikidata SPARQL queries |

## Prerequisites

- Node.js 20+
- A Supabase project with the schema migrations applied
- Anthropic API key
- ISBNdb API key

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/aidec0ded/book-library-app.git
   cd book-library-app
   npm install
   ```

2. Create a `.env` file in the project root:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_ANON_KEY=your-anon-key
   ANTHROPIC_API_KEY=your-anthropic-key
   ISBNDB_API_KEY=your-isbndb-key
   STRIPE_SECRET_KEY=sk_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_MONTHLY_PRICE_ID=price_...
   STRIPE_ANNUAL_PRICE_ID=price_...
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_POSTHOG_KEY=phc_...           # optional — analytics disabled if unset
   VITE_POSTHOG_HOST=https://us.i.posthog.com
   ```

   - `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS; used by scripts
   - `SUPABASE_ANON_KEY` used by the chat server to create per-user Supabase clients with RLS
   - `VITE_*` variables are exposed to the browser via Vite

3. Apply database migrations. All SQL files in `supabase/migrations/` should be run in order in the Supabase SQL Editor (CLI migrations are not used).

4. Start development (requires two terminals):
   ```bash
   # Terminal 1: Vite dev server (port 5173)
   npm run dev

   # Terminal 2: Chat API server (port 3001, auto-restarts)
   npm run dev:server
   ```

   Vite proxies `/api/chat`, `/api/greeting`, `/api/isbndb`, `/api/contact`, `/api/account`, `/api/stripe`, `/api/subscription`, and `/api/onboarding` to the chat server.

## Project Structure

```
src/
  App.tsx                     # React Router configuration
  pages/
    LandingPage.tsx           # Public landing page (standalone, no sidebar)
    LoginPage.tsx             # Login/signup with email+password and Google OAuth
    OnboardingPage.tsx        # Welcome gate + onboarding chat for new users
    ImportBooks.tsx            # Goodreads/CSV import with shelf mapping and progress
    PhilosophyPage.tsx        # Public editorial essay on reading philosophy
    FeaturesPage.tsx          # Public features page with sticky-scroll layout
    PricingPage.tsx           # Public pricing comparison (Free vs Companion)
    FAQPage.tsx               # Public FAQ with accordion sections
    ContactPage.tsx           # Public contact form page
    GuidePage.tsx             # Public user guide page
    Settings.tsx              # Account settings (password, export, subscription, delete)
    Home.tsx                  # Personalized home with greeting, reading, suggestions, stats
    BookList.tsx              # Library with search, filters, gallery tabs, shelves view
    BookDetail.tsx            # Full book metadata with inline editing and AI insights
    AddBook.tsx               # ISBNdb search → preview → add flow (auto-links reading paths)
    SyllabiPage.tsx           # Course catalog index with filter tabs (syllabi + reading paths)
    SyllabusDetail.tsx        # Detail view with conditional rendering for syllabi vs reading paths
    RecommendationsPage.tsx   # AI-predicted top picks grid
    ReleasesPage.tsx          # Monthly new releases with AI scoring
    Chat.tsx                  # Full-page AI reading companion
    Profile.tsx               # Snap-scroll reader profile slide deck
  components/
    Layout.tsx                # App shell (sidebar + content + chat panel)
    Sidebar.tsx               # Collapsible navigation sidebar
    ChatPanel.tsx             # Floating chat FAB + slide-up panel
    BookCover.tsx             # Cover image with styled placeholder fallback
    ProgressBadge.tsx         # Reading path progress badge (not_started/reading/completed)
    SeminarSection.tsx        # Expandable seminar content with inline editing
    ShelvesView.tsx           # Shelf index with cards + create form
    ShelfCarousel.tsx         # Full-screen immersive coverflow browser
    ShelfFilterBuilder.tsx    # Auto shelf filter rule editor
    SyllabusSearchModal.tsx   # Dual-search modal (library + ISBNdb)
    BookSearchModal.tsx       # Library-only search modal
    PersonalCanonEditor.tsx   # Canon grid with add/remove
    ui/                       # shadcn/ui components
  lib/
    supabase.ts               # Supabase client
    books.ts                  # Book update helpers
    lists.ts                  # Syllabus/reading path CRUD + external items + auto-linking
    shelves.ts                # Shelf CRUD + auto filter query builder
    vibes.ts                  # Vibe/tag CRUD
    releases.ts               # Release queries + dismiss/undismiss
    home.ts                   # Home page data queries
    profile.ts                # Profile CRUD + personal canon updates
    chat.ts                   # Conversation CRUD + SSE streaming client
    isbndb.ts                 # ISBNdb API client (search, lookup, edition grouping)
    awards.ts                 # Award queries for book detail
    posthog.ts                # PostHog analytics (init, identify, capture, pageview hook)
    types.ts                  # Shared TypeScript interfaces
  hooks/
    useChatSession.ts         # Chat state machine (shared context)
  contexts/
    AuthContext.tsx            # Supabase Auth session state
    ChatContext.tsx            # Chat session + panel open/close state
    SubscriptionContext.tsx    # Subscription state (plan, limits, isPaid)

server/
  index.ts                    # HTTP server: chat streaming + greeting + ISBNdb proxy
  auth.ts                     # JWT verification + per-user Supabase client creation
  library-index.ts            # Compact library index for system prompt (cached 10min)
  syllabus-handler.ts         # Syllabus tool command executor
  reading-path-handler.ts     # Reading path tool command executor (seminar content, progress)
  syllabus-index.ts           # Syllabi + reading paths context for system prompt (cached 10min)
  wishlist-handler.ts         # Wishlist tool command executor
  excerpt-handler.ts          # Excerpt save/view command executor
  book-handler.ts             # Book status/rating/favorite/delete executor
  releases-handler.ts         # Releases browse/top/search executor
  memory-handler.ts           # Claude memory tool file operations
  book-lookup.ts              # Fuzzy book matching + find-or-create for chat tools
  onboarding-prompt.ts        # Onboarding-specific system prompt builder
  profile-loader.ts           # Cached profile loader for chat prompt
  profile-scheduler.ts        # Activity-gated monthly profile regeneration
  greeting-handler.ts         # AI greeting generation with 1hr cache
  stripe-handler.ts           # Stripe webhook processing + checkout/portal sessions

scripts/
  import-books.ts             # CSV → Supabase bulk import (destructive)
  tag-vibes.ts                # AI canonical vibe tagging (17 fiction vibes)
  tag-classifications.ts      # AI classification tagging (nonfiction + poetry)
  enrich-isbndb.ts            # ISBNdb metadata enrichment (covers, pages, etc.)
  generate-profile.ts         # Claude-powered reader profile generation
  predict-ratings.ts          # AI predicted ratings for unread books
  ingest-releases.ts          # ISBNdb new releases ingestion
  score-releases.ts           # AI release scoring (general + personal)
  reclassify-genres.ts        # AI genre reclassification (29-genre taxonomy)
  ingest-awards.ts            # Wikidata literary awards ingestion + matching
  grant-subscription.ts       # Admin script to grant/revoke complimentary subscriptions
```

## Scripts Reference

All scripts use `npx tsx` and support common flags:

| Script | Purpose | Key Flags |
|--------|---------|-----------|
| `import-books.ts` | Import CSV data into Supabase | Destructive — re-inserts all rows |
| `tag-vibes.ts` | AI vibe tagging for fiction | `--dry-run`, `--limit N`, `--force` |
| `tag-classifications.ts` | AI classification for nonfiction/poetry | `--dry-run`, `--limit N`, `--force`, `--nonfiction`, `--poetry` |
| `enrich-isbndb.ts` | ISBNdb metadata enrichment | `--dry-run`, `--limit N`, `--force` |
| `generate-profile.ts` | Reader profile generation | `--dry-run`, `--force`, `--bootstrap` |
| `predict-ratings.ts` | AI predicted ratings | `--dry-run`, `--limit N`, `--force` |
| `ingest-releases.ts` | New releases from ISBNdb | `--dry-run`, `--limit N`, `--month YYYY-MM`, `--months N`, `--fiction`, `--language`, `--binding` |
| `score-releases.ts` | AI scoring for releases | `--dry-run`, `--limit N`, `--month YYYY-MM`, `--force` |
| `reclassify-genres.ts` | Genre reclassification | `--dry-run`, `--limit N`, `--force`, `--output`, `--apply FILE` |
| `ingest-awards.ts` | Literary awards from Wikidata | `--dry-run`, `--match-only`, `--force`, `--limit N` |

## Data Model

Fifteen tables in Supabase. Key tables:

- **books** — 1,711 rows with `book_type` (fiction/nonfiction/poetry), `status`, `rating`, `predicted_rating`, cover images, and ISBNdb metadata
- **book_vibes** — Classification tags with `tag_category` (vibe, topic, form, depth, movement, formal_feel, accessibility) and AI/user provenance tracking
- **canonical_tags** — 57 tags across 7 categories defining the classification vocabulary
- **lists** / **list_items** — Syllabi and reading paths (`list_type` discriminator) with ordered items supporting library books, external entries, seminar content (jsonb), and progress tracking
- **shelves** / **shelf_items** — Manual and auto-filtered bookshelves with JSON filter rules
- **conversations** / **messages** — Chat history
- **memory_files** — Persistent AI memory (Claude memory tool)
- **reader_profile** — AI-generated profiles with structured JSON data
- **new_releases** — ISBNdb releases with AI scoring
- **literary_awards** / **award_entries** — Award data matched to library books
- **user_subscriptions** — Stripe subscription tracking (plan, status, billing period, chat message counter)
- **book_excerpts** — AI-curated insights saved from chat conversations

## Chat Server Architecture

The chat server (`server/index.ts`) is a standalone Node.js HTTP server that:

1. Receives user messages via POST `/api/chat` (SSE streaming response)
2. Builds a system prompt from the library index, reader profile, and syllabi context (all cached 10min)
3. Streams Claude responses with a tool-use loop supporting 7 tools: memory, syllabi management, reading paths, wishlist, excerpts, book management, and releases search
4. Uses a dedicated onboarding prompt for new users (library population through conversation)
5. Generates conversation titles after the first exchange
6. Handles Stripe webhooks, checkout sessions, and subscription management
7. Runs a daily profile scheduler that checks activity deltas against the last generation snapshot

## Git Workflow

1. Branch from `main` (`git checkout -b descriptive-name`)
2. Make changes
3. Verify with `npm run build`
4. Commit, push, merge (fast-forward), push main
5. Never commit directly to `main`

## License

Private repository. All rights reserved.
