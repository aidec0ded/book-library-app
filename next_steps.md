### 🐛 Bugs

- Need to be able to remove a book from library **[DONE]**
- Add any missing metadata into empty fields; ensure data is as clean as possible **[DONE]**
- On all pages with multiple pages of books, you can't go directly to a specific page — have to cycle through them **[DONE]**
- New releases are once again showing all new releases in descending order for recommended, rather than only showing those that score at least 7 **[DONE]**

---

### ✨ Features

**Core functionality**

- Document the app / create a GitHub readme
- User signup and profile creation
- Deploy to cloud (Vercel/Cloudflare Pages + serverless)
- Bulk canonical tagging script + two-tier tagging flow in `tag-vibes.ts` **[DONE]**
- Auto-triggering profile regeneration **[DONE]**
- Ability to edit cover images (manual URL entry or upload) — ISBNdb sometimes returns low-quality photos of physical books instead of proper cover art **[DONE]**
- ISBN discovery + bulk enrichment for books without ISBNs — many fiction-spreadsheet-only books have no cover, genre, pages, publisher, etc. because `enrich-isbndb.ts` requires an ISBN. Need a script to search ISBNdb by title+author, find the ISBN, then enrich. Plus manual ISBN entry on BookDetail for corrections. **[DONE]**
- Adjust rating from half stars to quarter stars **[DONE]**
- Add awards/nominations as metadata field (may require separate lookup or manual database) **[DONE]**
- Add filters for publishing year and page count **[DONE]**
- Investigate ISBNdb "Reviews" endpoint — what does it return? **[DONE]**

**AI & personalization**

- Replace "Notes" section on book detail with explanation of predicted rating **[DONE]**
- Add new Notes section with user-written notes + conversation excerpts from chatbot **[DONE]**
- Freeform vibes include too much seasonal language — consider eliminating AI-generated freeform vibes entirely and letting users create their own **[DONE]**

**Discovery & recommendations**

- Redesign "What to Read Now" — hide seasonal tagging, surface context-aware picks (season + vibes + current reading patterns). Replace Seasonal Page with a "Recommendations" page linked from "More Recommendations." **[DONE]**
- Recommended New Releases should filter to scores ≥7, not just sort by score **[DONE]**
- Filter New Releases by genre **[DONE]**

**Add Book experience**

- Improve search results: deduplicate by work (group editions of the same title+author, surface best edition, collapse the rest behind "X editions" indicator), prioritize books *by* an author over books *about* them when searching by author name — edition grouping, subtitle normalization, and parallel author-column search all shipped; works well for most authors but very famous authors (e.g. Rushdie) still get noisy results from ISBNdb. Revisit if needed
- Fix premature "No results found" message that appears while typing before search is submitted; add clear indication that Enter executes search **[DONE]**
- Add "Add to Wishlist" option in the Add Book flow (currently only available on New Releases page) **[DONE]**

**Non-fiction & poetry**

- Design first-class experience for non-fiction and poetry — adaptive hybrid architecture chosen. Design docs at `.claude/design/`. Data foundation complete: `book_type` column on books (backfilled: 1088 fiction, 595 nonfiction, 18 poetry), `tag_category` on book_vibes, `canonical_tags` table seeded with 57 tags across 7 categories. Implementation plan at `.claude/plans/implementation-plan.md` — Phase A complete, continuing with Phase B (classification UI) **[Phase A DONE]**


**Social & engagement**

- Reading paths — interest-driven explorations (author catalogs, literary movements, award lists) with progress tracking and AI-assisted creation/check-ins. Stretch: AI-generated "seminar" layer — structured syllabi with deliberate sequencing, historical/cultural context before each work, guided reading focus, post-book discussion, and adaptation based on the reader's reactions throughout the path
- Reading Life narrative — AI-identified eras/chapters in the reader's journey (not a chronological timeline but a thematic story), with key books, transition points, vibe/genre composition, and conversation insights per era. **First step:** add `date_read` column to books (set automatically when status changes to "read") so temporal data accumulates over time
- Social features strategy — determine which social interactions serve meaningful reading vs. social performance. Candidates: editorial public lists with write-ups, sharing reader insights/profiles (not metrics), seminar cohorts on reading paths, taste-based discovery. Requires auth/multi-user first

**Chat experience**

- Persistent, minimizable chat window that can be triggered from any page and uses that page's context **[DONE]**
- Expand chat tool use — can it access the web (check new releases), remove a book from the library, change book status (e.g. remove from "Reading"), and take other site actions beyond list management? **[DONE]**
- Add web access tool to chat (e.g. search for books, look up author info, check reviews)

---

### 🎨 UI Improvements

**Layout & navigation**

- Create a public-facing home page for all users
- Move navigation to collapsible sidebar **[DONE]**
- Make home page closer to screenshot reference
- No direct pagination — need a way to jump to a specific page in Library (currently 46 pages) **[DONE]**
- New Release detail box should appear directly under selected book, not at bottom of page **[DONE]**
- ~~"Up Next" toggle~~ — Removed from UI; low utility vs. lists for reading queues **[DONE]**

**Page redesigns**

- **Book Detail page** — Cover + status/rating/favorite/up next on left; predicted rating, notes, metadata, vibes, summary on right; Notes section below both **[DONE]**
- **Shelf page** — Reference Cosmos screenshot; consider unified cover-based view for entire library with dynamic filtering **[DONE]**
- **Vibes page** — Current box layout needs visual refresh
- **Reader Profile page** — More attractive layout, better visuals **[DONE]**

**Polish**

- List view styling refinements
- Clean up genres — map to broader Amazon-style categories **[DONE]**
- Redesign star rating input — replace dropdown with interactive star widget (Letterboxd-style hover/tap with quarter-star precision). Current dropdown is bulky and unattractive **[DONE]**
- Add accent color — find strategic places for splashes of a warm color (e.g. LitHub-style red hue) to break up the neutral palette **[DONE]**
- Rename "Freeform Vibes" to "Tags" on BookDetail — the old label is confusing now that AI freeform vibes are gone, and users will tag with more than just vibes **[DONE]**