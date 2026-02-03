# MoodLib

Personal book library app that recommends books based on mood, season, and vibe. 1,711 books imported from BookBuddy+ catalog and a curated fiction spreadsheet. AI-powered vibe tagging via Claude API.

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
```

SQL migrations (`supabase/migrations/`) are run manually in the Supabase SQL Editor, not via CLI.

## Tech Stack

- React + Vite + TypeScript (frontend)
- Supabase (PostgreSQL + auth + Row Level Security)
- Tailwind + shadcn/ui for styling
- Claude API (`@anthropic-ai/sdk`) for AI vibe tagging
- ESM throughout (`"type": "module"` in package.json)

## Architecture

**Current:** Import pipeline + AI tagging pipeline + interactive frontend. Two CSV source files are parsed, merged on a normalized title+author key, and batch-inserted into Supabase. The `tag-vibes.ts` script bulk-tags fiction-list books with AI-generated vibes via Claude API. The React frontend provides a searchable, paginated book list, detail view with vibe editing, and seasonal recommendations.

**Frontend structure:**
- `src/main.tsx` — React entry point
- `src/App.tsx` — React Router: `/` (BookList), `/books/:id` (BookDetail)
- `src/components/Layout.tsx` — App shell with header + `<Outlet />`
- `src/pages/BookList.tsx` — Debounced search, pagination via Supabase `.range()`
- `src/pages/BookDetail.tsx` — Full book metadata display
- `src/lib/supabase.ts` — Supabase client (uses `VITE_SUPABASE_ANON_KEY`)
- `src/lib/vibes.ts` — Vibe CRUD operations (fetch, add, remove, confirm)
- `src/components/VibeEditor.tsx` — Inline vibe editor with AI badge styling and confirm/remove actions
- `src/components/ui/` — shadcn/ui components (Badge, Card, Input, Separator)
- `scripts/tag-vibes.ts` — Bulk AI vibe tagging script (batches of 5, retries, --dry-run/--limit/--force flags)

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
- "Personalized" card — Transformative Potential, Canon Potential, Notes (conditionally rendered)
- "Metadata" card — Genre, Category, When to Read, ISBN, dates
- Rating promoted to hero area below status badges
- VibeEditor repositioned between Personalized and Metadata cards

### Phase 8: Data Enrichment via ISBNdb

Two sub-phases: build the external data layer, then enrich the existing library.

**8a. ISBNdb integration layer**
- ISBNdb (paid API) as the external book data source — high-res cover images and rich metadata
- New `scripts/enrich-books.ts` script (or `src/lib/isbndb.ts` service module) to look up books by ISBN
- Fetch: cover image URL, page count, publisher, publication year, format, description/synopsis
- Rate limiting and error handling for the ISBNdb API
- `ISBNDB_API_KEY` env var

**8b. Enrich existing library**
- Backfill `cover_image_url` for books with ISBNs (highest-impact enrichment — hero area already supports it)
- New DB columns: `page_count`, `publisher`, `publication_year`, `format` (new migration)
- Bulk enrichment script with --dry-run/--limit/--force flags (same pattern as tag-vibes.ts)
- Update BookDetail Metadata card to display new fields

### Phase 9: Add Books

- "Add Book" flow: search ISBNdb by title/author or enter ISBN directly, fetch metadata, user confirms and saves
- No barcode scanning (web app — not a good fit)
- Add Book UI: search form → results list → confirm/edit prefilled metadata → save to Supabase

### Phase 10: Discovery & Wishlist (future)

- Browse/search books not yet in the library via ISBNdb
- Wishlist or "want to read" status for books the user doesn't own yet
- Data model implications: books table may need a concept of "owned" vs "wishlisted"

### Phase 11: Reviews & AI Search (future)

- "What Others Are Saying" — critical/reader reviews section on detail page (data source TBD)
- AI-powered search/lists — use freeform vibes + book metadata for natural-language queries ("books for a rainy Sunday," "something like Donna Tartt but weirder")

## Data Model

Two tables in Supabase:

**books** — 1,711 rows. Key fields beyond the obvious:
- `timing_month` (1-12), `timing_position` (early/mid/late), `timing_raw` — seasonal reading data from the fiction spreadsheet. ~917 books have timing; ~794 catalog-only books have nulls.
- `transformative_potential`, `canon_potential` — editorial notes from the fiction spreadsheet
- `rating` — numeric 0-5 in 0.5 increments; null means unrated (catalog stored 0.0 for unrated)
- `status` — read, unread, reading, unfinished (lowercased from catalog)
- `is_favorite`, `is_up_next` — booleans from catalog flags

**book_vibes** — Vibe tags for books. Each row links a vibe string to a book. Key fields:
- `ai_assigned` / `user_confirmed` — tracks provenance; AI vibes start unconfirmed, users can confirm in the UI
- `is_canonical` (planned) — distinguishes the 17 canonical vibes used for browsing/filtering from freeform descriptive vibes. Canonical vibes are the primary discovery axis; freeform vibes provide richness for detail pages and future AI search.

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

## Code Style

- Strict TypeScript, ESM imports
- Frontend: Vite + React + Tailwind v4 + shadcn/ui (New York style, neutral palette)
- `@/*` path alias maps to `src/*`
- shadcn/ui components live in `src/components/ui/`
