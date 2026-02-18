# MoodLib Implementation Plan

Comprehensive ordered plan for all remaining work, incorporating the adaptive hybrid multi-type architecture and remaining backlog items. Dependencies flow downward — each phase builds on the previous.

Reference docs:
- `.claude/design/nonfiction-discovery.md`
- `.claude/design/poetry-discovery.md`
- `.claude/design/multi-type-architecture.md`

---

## Phase A: Multi-Type Data Foundation

**Why first:** Every subsequent phase depends on `book_type` existing on books and the classification system being in place. This is pure infrastructure with zero UI disruption — the app continues working identically after these migrations.

| # | Item | Notes |
|---|------|-------|
| A1 | Migration: add `book_type` to `books` | `text NOT NULL DEFAULT 'fiction'` with check constraint. Backfill from 29-genre taxonomy. |
| A2 | Migration: add `tag_category` to `book_vibes` | `text NOT NULL DEFAULT 'vibe'` with check constraint. All existing rows stay `'vibe'`. Update unique constraint to `(book_id, vibe, tag_category)`. |
| A3 | Migration: create `canonical_tags` table | Seed with 17 existing vibes + nonfiction topics/form/depth + poetry movement/formal_feel/accessibility. |
| A4 | Update TypeScript types | Add `book_type` to `Book`/`BookSummary`, `tag_category` to `BookVibe`, new `CanonicalTag` type. |
| A5 | Refactor canonical-vibes.ts | Read from `canonical_tags` table instead of hardcoded array. Support querying by `tag_category`. |
| A6 | Update `mapToBookInsert` in isbndb.ts | Detect `book_type` from ISBNdb subjects when adding new books. |

**Verification:** Build passes. Existing app works identically. `book_type` populated for all books. Canonical tags queryable from DB.

---

## Phase B: Classification & Tagging

**Why second:** With the data model in place, build the UI to display and edit type-specific classifications, and the AI script to populate them. This is the first phase where the app starts *looking* different for nonfiction/poetry books.

| # | Item | Notes |
|---|------|-------|
| B1 | Parameterize VibeEditor for book type | Accept `book_type` prop. Render type-appropriate canonical grids: vibes for fiction, topics + form + depth for nonfiction, movement + formal_feel + accessibility for poetry. Single-select UI (dropdown) for form/depth/accessibility; multi-select badges for vibes/topics/movement/formal_feel. |
| B2 | Update BookDetail | Pass `book_type` to VibeEditor. Classification section adapts per type. Everything else stays constant. |
| B3 | Add `book_type` selector to AddBook | Show on preview screen with auto-detected default from ISBNdb subjects. User can override. |
| B4 | Build `tag-classifications.ts` script | Unified script with type-specific prompts. Tags nonfiction books with topics/form/depth, poetry with movement/formal_feel/accessibility. Same batch/retry/dry-run architecture as `tag-vibes.ts`. |
| B5 | Run tagging | Execute against existing nonfiction and poetry books in the library. |

**Verification:** Nonfiction book detail shows topics/form/depth instead of vibes. Poetry book detail shows movement/formal_feel/accessibility. Fiction unchanged. New books get auto-detected type.

---

## Phase C: AI Intelligence Layer

**Why third:** The classification data now exists. This phase makes the AI understand all three domains — the "backbone and intelligence" that enables future features. This is the phase the user specifically emphasized.

| # | Item | Notes |
|---|------|-------|
| C1 | Update library index | Include `book_type` and type-specific tags in each book's line. Feeds chat companion, profile generator, and all AI features. |
| C2 | Update chat system prompt | Add type-aware conversation guidance. Fiction: vibes/emotional resonance. Nonfiction: ideas/connections/rabbit holes. Poetry: voice/form/poet relationships. Not separate code paths — prompt guidance that the model adapts to. |
| C3 | Extend reader profile schema | Add `nonfiction_identity`, `nonfiction_interests`, `poetry_identity`, `poet_affinities` to `ReaderProfileData`. Optional fields, generated only when library has enough data of that type. |
| C4 | Update profile generation prompt | Instruct Claude to weave cross-type connections in `reader_identity` while producing type-specific facets. Update `formatLibrary` to include type-specific tags. |
| C5 | Update predicted ratings | Type-specific calibration sets (nonfiction predictions calibrated against nonfiction ratings, etc.). Include type-appropriate classification in per-book prompts. Fallback to cross-type calibration when < 5 rated books of a type. |
| C6 | Update recommendation scoring | Fiction: current algorithm (predicted rating + vibe match + seasonal). Nonfiction: predicted rating + topic affinity + depth match. Poetry: predicted rating + movement affinity + poet loyalty boost. Cross-type diversity so fiction doesn't crowd out other types. |
| C7 | Update release scoring | Evolve `is_fiction` toward `book_type` awareness. Scoring prompts include type-specific profile sections for better personal relevance. |

**Verification:** Chat companion discusses nonfiction/poetry with appropriate lens. Profile regeneration produces type-specific sections. Predictions use type-appropriate calibration. Recommendations surface all types.

---

## Phase D: Library Browsing & Discovery

**Why fourth:** Classification exists, AI understands types, now surface it in the browsing experience.

| # | Item | Notes |
|---|------|-------|
| D1 | Add `book_type` filter to BookList | Top-level tabs or segmented control: All / Fiction / Nonfiction / Poetry. URL param `?type=nonfiction`. |
| D2 | Conditional filter rendering | Fiction: status, rating, genre, month, vibes. Nonfiction: status, rating, genre, topics, form, depth. Poetry: status, rating, movement, formal_feel, accessibility. All: status, rating, genre, search. |
| D3 | Evolve Vibes page into Discover page | Tabbed by type. Fiction tab: canonical vibe grid (current). Nonfiction tab: topic grid + form breakdown. Poetry tab: movement clusters. Clicking a tag navigates to library pre-filtered. |

**Verification:** Library page filters adapt per type. Discover page shows type-appropriate browsing grids. Navigation between discovery and filtered library works.

---

## Phase E: Page Redesigns

**Why fifth:** The data model, AI, and browsing infrastructure are stable. Page redesigns can now incorporate multi-type awareness from the start, avoiding rework.

| # | Item | Notes |
|---|------|-------|
| E1 | Reader Profile page redesign | Now has type-specific sections (nonfiction_identity, poetry_identity, poet_affinities). Better visual hierarchy, typography, card layout. Most impactful redesign. |
| E2 | Shelf page redesign | Reference Cosmos screenshot. Consider unified cover-based view with dynamic filtering. Auto shelves can now filter by `book_type` and type-specific classifications. |
| E3 | Home page refinements | Type breakdown in library stats. Cross-type diverse suggestions. Polish stats grid responsiveness, greeting loading skeleton, carousel. |
| E4 | List view styling | Refinements to existing layout. |

**Verification:** All redesigned pages look polished and incorporate multi-type data where relevant.

---

## Phase F: Shelf & Discovery Polish

**Why sixth:** Builds on the redesigned pages with type-aware filtering capabilities.

| # | Item | Notes |
|---|------|-------|
| F1 | ShelfFilter extensions | Add `book_type`, `topics`, `form`, `depth`, `movement`, `formal_feel`, `accessibility` to `ShelfFilter` type and `buildAutoShelfQuery`. |
| F2 | ShelfFilterBuilder conditional controls | Show type-appropriate filter controls based on selected `book_type`. Enables auto shelves like "Accessible Narrative Nonfiction" or "Confessional Poetry." |
| F3 | General polish | Any remaining visual cleanup across pages. |

**Verification:** Auto shelves work with type-specific filters. ShelfFilterBuilder adapts per type.

---

## Phase G: Documentation & Deployment ✅

**Why seventh:** The feature set is now stable. Document what exists before the architecture changes again with auth. Deployment decisions inform auth choices.

| # | Item | Notes |
|---|------|-------|
| G1 | ✅ GitHub readme | Product description, tech stack, setup instructions. README + User Guide + PRD. |
| G2 | ✅ Deployment architecture decisions | Single Render web service — serves Vite-built frontend + Node.js chat server + ISBNdb proxy. No separate static hosting needed. |
| G3 | ✅ Deploy to cloud | Live at rekollekt.onrender.com. Environment variables configured. Auto-deploys from main. |

**Verification:** App accessible at a public URL. README accurate.

---

## Phase H: Auth & Multi-User ✅

**Why eighth:** Everything before this works for a single user. Auth changes the data model (RLS), server (JWT), and frontend (login/signup). Better to have all features stable first.

| # | Item | Notes |
|---|------|-------|
| H1 | ✅ User signup and profile creation | Supabase Auth. RLS policies across all tables. Login/signup UI with Google OAuth. User-scoped queries throughout. Server-side JWT verification. |
| H2 | ✅ Public-facing home page | Landing page, philosophy page, features page, contact page for unauthenticated users. |

**Verification:** Multiple users can sign up, each sees only their own library. Public landing page works.

---

## Phase I: Ambitious Features

**Why last:** These build on everything — stable UI, deployed app, multiple users, accumulated data, and the multi-type AI intelligence layer.

| # | Item | Notes |
|---|------|-------|
| I1 | Chat web access tool | Search for books, look up author info, check reviews. Lower dependency on other work — could move earlier if desired. |
| I2 | ✅ Reading paths + seminar layer | AI-generated structured reading paths with thesis, seminar content (pre-reading context, focus questions, post-reading prompts), progress tracking. Books not in library are auto-added as wishlist items (syllabi + reading paths). |
| I3 | Reading Life narrative | AI-identified eras/chapters in the reader's journey. `date_read` column already exists and accumulating data. Better with more history. |
| I4 | Social features | Editorial public lists, sharing insights/profiles, seminar cohorts, taste-based discovery. Requires auth/multi-user. Strategic design decisions needed first. |

---

## Remaining Backlog Items (not in phases above)

These are minor items that can be addressed opportunistically:

- **Add Book search dedup for very famous authors** (Rushdie edge case) — ISBNdb limitation. Revisit if user feedback warrants it.
- **Home page closer to screenshot reference** — Folded into E3 home page refinements.
- ✅ **Data import (Goodreads, CSV, etc.)** — Moved to Alpha Launch Tier 1 in `next_steps.md`.
- ✅ **Early reader profile generation** — Scheduler auto-generates first profile (bootstrap mode) when new user hits 8 books + 5 rated. Profile page shows progress bars.

---

## Dependency Graph

```
Phase A (Data Foundation)
  ↓
Phase B (Classification UI + Tagging)
  ↓
Phase C (AI Intelligence) ←── most critical for extensibility
  ↓
Phase D (Library Browsing & Discovery)
  ↓
Phase E (Page Redesigns) ←── informed by all above
  ↓
Phase F (Shelf & Polish)
  ↓
Phase G (Documentation & Deployment)
  ↓
Phase H (Auth & Multi-User)
  ↓
Phase I (Ambitious Features)
```

Phases A–C are the backbone. Phases D–F are the experience. Phases G–I are infrastructure and future.

---

## Verification Protocol

After each phase:
- `npm run build` passes
- Manual spot-check of affected pages
- Commit + merge to main per established workflow
