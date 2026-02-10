# Rekollekt Product Requirements Document

## Mission

Most book apps and communities have drifted toward social performance and goal-chasing — read counts, public ratings, challenges completed — at the expense of actually reading meaningfully. Rekollekt is the antidote: an app that helps readers understand how books affect them, and uses that understanding to guide what they read next.

Rekollekt exists for readers who want a personal, reflective relationship with their library. Not a public review site, not a social platform, not a reading sprint tracker — a space that celebrates the reader's own collection and makes them excited to step into it.

## Vision

The app's central loop is:

**Read > Reflect > AI understanding deepens > Better recommendations and insights > Read more intentionally**

Ratings and notes alone don't capture why a book resonated. The AI reading companion is the mechanism for deeper reflection — a place to discuss what you're reading, how it's making you feel, and how it connects to other books and ideas. Over time, the AI builds a reader profile that enables genuinely personal recommendations, predicted ratings, and proactive suggestions grounded in the reader's evolving tastes.

Everything should feel personal. The app should celebrate the reader's own library and make them excited to "step into" it.

## Product Direction

Rekollekt is being built as a public web application (and eventually mobile). The current development phase uses a single library to get the experience right before adding authentication, multi-user data isolation, and hosting. Features are evaluated as product decisions — "would this be valuable to readers?" — not just personal utility.

---

## Feature Requirements

### 1. Personal Library

**Purpose:** The foundation of Rekollekt — a reader's complete book collection, searchable and browsable with rich metadata.

**Requirements:**
- Support fiction, nonfiction, and poetry as distinct book types, each with its own classification vocabulary
- Searchable by title and author with debounced instant results
- Filterable by status, rating, genre, page count, publication year
- Gallery browsing by classification tags (vibes for fiction, topics/form/depth for nonfiction, movement/formal_feel/accessibility for poetry)
- Inline editing of status, rating, favorite flag, notes, cover image, and ISBN on the book detail page
- Cover images sourced from ISBNdb with styled placeholder fallbacks
- Literary award badges (winner, shortlist, longlist, nominee) displayed on book detail pages
- ISBNdb enrichment pipeline for metadata (covers, page counts, publishers, publication years)

**Classification System:**
- 17 canonical fiction vibes (atmospheric, cerebral, dark, intimate, etc.)
- 15 nonfiction topics + 6 forms + 4 depth levels
- 7 poetry movements + 5 formal feels + 3 accessibility levels
- AI-assigned tags with user confirmation workflow
- Support for freeform user-created tags alongside canonical ones

### 2. AI Reading Companion

**Purpose:** The core differentiator — an empathetic, knowledgeable reading partner that deepens the reader's relationship with their books through conversation, and takes practical actions on their behalf.

**Requirements:**
- Streaming chat interface powered by Claude (Sonnet model)
- Full conversation history preservation with auto-generated titles
- Accessible from every page via floating panel, plus a dedicated full-page view
- Context-aware: "Discuss this book" launches a focused conversation from any book detail page

**AI Capabilities:**

The companion has access to the reader's complete library (title, author, type, status, rating, vibes/tags, notes) and reader profile. It operates through a tool-use loop that supports:

| Tool | Actions | Description |
|------|---------|-------------|
| Memory | read, write, list, delete | Persistent memory files that survive across conversations. The AI records preferences, emotional reactions, connections between books, and evolving tastes. Organized by topic, not chronology. |
| Syllabi | create, view, add_books, remove_books, delete | Creates and manages curated reading collections with rationale for each book selection. |
| Wishlist | add, view, remove | Manages books the reader wants but doesn't own. |
| Excerpts | save, view | Saves polished 1-3 sentence insights from conversations to specific book detail pages. |
| Book Management | update_status, update_rating, toggle_favorite, delete | Modifies library data based on conversational cues ("I just finished The Road"). |
| Releases Search | browse, top, search | Searches the new releases pipeline by month, score, or keyword. |

**Conversation Design Principles:**
- Approach fiction through emotional resonance, atmosphere, narrative voice, and thematic connections
- Approach nonfiction through ideas, arguments, how the author's approach shapes understanding, and connections to intellectual interests
- Approach poetry through language, form, emotional register, and poet voice relationships
- Draw cross-type connections when relevant (a novel's themes connecting to a nonfiction interest)
- Always confirm before taking destructive actions (deleting books, creating syllabi proactively)
- Check memory at the start of each conversation; record meaningful new insights

### 3. Reader Profile

**Purpose:** An AI-generated portrait of who the reader is, what drives their book choices, and how their tastes are evolving. The foundation for personalized recommendations and predictions.

**Requirements:**
- Generated monthly via Claude (Opus model) when meaningful activity is detected
- Activity-gated: regeneration requires both 30+ days since last generation AND at least one activity threshold met (new books read, ratings given, conversations held, notes written, favorites marked, or books added)
- Structured profile data covering:
  - **Reader Identity** — Narrative description of the reader's personality and tendencies
  - **Thematic Pillars** — Core themes with descriptions and example books
  - **Taste Evolution** — Current gravitational pulls, consistent throughlines, and a shift log
  - **Emotional Patterns** — How the reader engages emotionally with books
  - **Reading Life Snapshot** — Statistical data (status breakdown, currently reading, recently finished, pace)
  - **Personal Canon** — Definitive favorite books (user-editable)
- Multi-type extensions: nonfiction identity/interests and poetry identity/poet affinities when the library has sufficient data of those types
- Displayed as a full-screen snap-scrolling slide deck with editorial typography
- Profile data feeds into predicted ratings, recommendations, release scoring, and the chat companion's context

### 4. Predicted Ratings

**Purpose:** Help readers prioritize their unread books by predicting how much they'll enjoy each one.

**Requirements:**
- AI-generated predicted ratings (0.5-5.0 scale) for unread and wishlisted books
- Generated in batches of 20 via Claude (Sonnet model)
- Type-specific calibration: fiction predictions calibrated against fiction ratings, nonfiction against nonfiction, etc.
- Cross-type fallback when fewer than 5 rated books of a type exist
- Each prediction includes a brief rationale
- Displayed on book detail pages and the Recommendations page
- Recommendations page shows top 20 predicted picks in a cover grid

### 5. Syllabi

**Purpose:** Curated, editorial reading collections that group books around themes, with explanations for why each book belongs. The precursor to reading paths and the seminar layer.

**Requirements:**
- Create syllabi manually through the UI or via the AI reading companion
- Each item supports a **rationale** field — a short explanation of why the book belongs
- Support **non-library books** (external items with title, author, cover URL, ISBN) — this is the key differentiator from shelves
- External items display with distinct visual treatment (amber background, "Not in library" badge)
- External items with ISBNs link to Bookshop.org for acquisition
- Dual-search modal for adding items: searches both the user's library and ISBNdb simultaneously
- Numbered editorial layout (01, 02, 03...) with cover thumbnails
- Inline rationale editing (click to add/edit)
- Reorder and remove items via hover actions
- AI-generated syllabi marked with "Rekollekt Generated" badge
- Editable titles and descriptions

### 6. Visual Shelves

**Purpose:** Make the library feel like a physical space you want to browse, not just a database table.

**Requirements:**
- **Manual shelves** — User-created groupings with ordered books, add/remove, and reorder controls
- **Auto shelves** — Define filter rules and the shelf populates automatically. Supported filters: status, genre, rating, timing month, vibes, topics, form, depth, movement, formal_feel, accessibility, book type, favorites
- **Coverflow carousel** — Full-screen immersive browsing within any shelf. Center-stage current book with prev/next peeking. Keyboard, scroll, and click navigation. Side panel with summary and classification tags on large screens.
- Shelf cards on the index page show book count and cover preview

### 7. New Releases Discovery

**Purpose:** Help readers discover upcoming books that match their tastes, scored for personal relevance.

**Requirements:**
- Ingest new releases from ISBNdb on a rolling 3-month window
- AI scoring with two components:
  - **General signal** (1-10): cultural significance, critical reception, author reputation
  - **Personal score** (1-10): match to the reader's profile, themes, and preferences
  - **Combined score**: weighted 60% personal + 40% general
- One-sentence AI rationale for each score
- Monthly browse view with score-colored badges
- Sort by AI recommendation or alphabetical
- Filter by fiction/nonfiction
- Inline detail expansion with full metadata, synopsis, rationale breakdown, and action buttons
- Wishlist integration ("Want to Read")
- Dismiss/undismiss for uninteresting releases
- "In Library" badge for books already owned
- Bookshop.org purchase links

### 8. Personalized Home

**Purpose:** A welcoming, personalized landing page that reflects the reader's current reading life.

**Requirements:**
- Time-of-day aware AI-generated greeting with accent-highlighted phrases (1-hour cache)
- Currently reading hero section with book cover, metadata, and "Dive Deeper" chat shortcut
- "Picked for You" section with top AI-recommended books and predicted ratings
- Recently added books
- "Reading DNA" stats card: completion percentage donut, top author, top vibe, total count

### 9. Book Addition

**Purpose:** Add any book to the library by searching ISBNdb's comprehensive database.

**Requirements:**
- Search by title, author, or ISBN
- Edition grouping: multiple editions of the same work are collapsed into one result showing the best-metadata edition
- ISBN shortcut: entering a valid ISBN bypasses search and goes directly to the book
- Preview with cover, metadata, synopsis, and auto-detected book type
- Duplicate detection by ISBN with link to existing book
- User-overridable book type (fiction/nonfiction/poetry)
- Add with status selection or direct-to-wishlist button

---

## AI Integration Architecture

AI is woven throughout Rekollekt at multiple levels:

### Real-Time (Chat)
- **Model:** Claude Sonnet
- **Architecture:** Streaming SSE with tool-use loop. The server builds a system prompt from three cached sources (library index, reader profile, syllabi index — all 10-minute TTL) and forwards streaming text deltas to the client while executing tool calls between rounds.
- **Context:** The AI sees the reader's complete library (compact index format), their full reader profile, all syllabi with contents, and its own persistent memory files.

### Batch Processing (Scripts)
- **Profile Generation:** Claude Opus, run monthly when activity thresholds are met. Ingests the full library with tags, conversation history, memory files, and the previous profile. Produces structured JSON matching the `ReaderProfileData` schema.
- **Predicted Ratings:** Claude Sonnet, batches of 20 unread books. Each batch includes the reader profile, a calibration set of rated books of the same type, and the target books with their classification data.
- **Release Scoring:** Claude Sonnet, batches of 10 releases. Each batch includes the reader profile and book metadata. Produces general signal score, personal score, combined score, and rationale.
- **Classification Tagging:** Claude Sonnet, batches of 5 books. Type-specific prompts generate canonical tags for fiction (vibes), nonfiction (topics/form/depth), and poetry (movement/formal_feel/accessibility).
- **Genre Reclassification:** Claude Sonnet, batches of 20 books. Two-phase workflow: generate review JSON, then apply to database after human review.

### Background (Server)
- **Profile Scheduler:** Daily check comparing current activity counts against the snapshot stored at last generation time. If 30+ days have passed and any threshold is met, spawns the profile generation script as a child process.
- **Greeting Generation:** Claude Sonnet, triggered on home page load with a 1-hour cache. Produces a brief personalized greeting based on the reader's current reading activity.
- **Title Generation:** Claude Sonnet, fire-and-forget after the first message exchange in a new conversation. Produces a 3-6 word conversation title.

### Data Pipeline
- **ISBNdb Enrichment:** Bulk metadata enrichment (covers, page counts, publishers). Rate-limited to 1 request/second with retries.
- **ISBNdb Releases:** Paginated ingestion of new releases with month validation, batch upsert, and configurable filtering (language, binding, fiction-only).
- **Wikidata Awards:** SPARQL queries against 17 literary awards using 4 query patterns (point-in-time, qualifier, direct, reversed). Results matched to library books by normalized title+author.

---

## Data Model Summary

| Table | Purpose | Key Characteristics |
|-------|---------|-------------------|
| books | Core library | 1,711 rows, `book_type` (fiction/nonfiction/poetry), status, rating, predicted_rating, cover images, ISBNdb metadata |
| book_vibes | Classification tags | 7 tag categories with AI/user provenance tracking |
| canonical_tags | Tag vocabulary | 57 tags across 7 categories |
| lists | Syllabi containers | Name, description, `ai_generated` flag |
| list_items | Syllabus entries | Ordered items with nullable `book_id`, rationale, external book metadata |
| shelves | Shelf containers | Manual or auto type, JSON filter rules |
| shelf_items | Shelf entries | Ordered book references (library books only) |
| conversations | Chat sessions | Auto-titled after first exchange |
| messages | Chat messages | User and assistant roles |
| memory_files | AI persistent memory | Virtual file paths managed by Claude |
| reader_profile | AI profiles | Structured JSON with generation metadata and activity snapshots |
| book_excerpts | Saved insights | AI-curated observations linked to books and conversations |
| new_releases | Upcoming books | ISBNdb data with AI scoring (general + personal + combined) |
| literary_awards / award_entries | Award data | 17 awards from Wikidata matched to library books |

---

## Product Roadmap

### Completed
- Multi-type data foundation (book_type, tag_category, canonical_tags)
- Classification UI and AI tagging for all three types
- AI intelligence layer (type-aware chat, profile, predictions, recommendations, release scoring)
- Library browsing with type-specific gallery tabs and filters
- Page redesigns (home, profile, shelves, recommendations, releases)
- Shelf and discovery polish (type-aware auto shelf filters)
- Lists-to-Syllabi redesign with rationale and external book support

### Current Phase: Documentation & Deployment
- Product documentation (README, user guide, PRD)
- Deployment architecture decisions
- Cloud deployment (frontend + server + environment config)

### Next: Authentication & Multi-User
- Supabase Auth integration with RLS policies
- User-scoped queries throughout
- Login/signup UI
- Public landing page for unauthenticated users

### Future
- Chat web access tool (search for books, look up author info, check reviews)
- Reading paths and seminar layer (structured syllabi with sequencing, context, guided reading, post-book discussion)
- Reading Life narrative (AI-identified eras and chapters in the reader's journey)
- Social features (shared lists/shelves/profiles, seminar cohorts, taste-based discovery)
- Mobile application

---

## Design Principles

1. **Personal over social** — The app celebrates the individual reader's relationship with books, not public performance or social comparison.
2. **Reflection over tracking** — Understanding *why* a book resonated matters more than logging that you read it.
3. **AI as partner, not oracle** — The AI reading companion discusses and explores with you; it doesn't just dispense recommendations.
4. **Library as space** — The reader's collection should feel like a room they want to spend time in, not a spreadsheet.
5. **Type-aware, not type-siloed** — Fiction, nonfiction, and poetry each deserve their own lens, but the most interesting insights come from the connections between them.
6. **Honest utility** — If a feature doesn't add real value for readers, remove it rather than building around it.
