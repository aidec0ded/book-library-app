### 🐛 Bugs

- Need to be able to remove a book from library **[DONE]**
- Add any missing metadata into empty fields; ensure data is as clean as possible
- On all pages with multiple pages of books, you can't go directly to a specific page — have to cycle through them
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
- Freeform vibes include too much seasonal language — consider eliminating AI-generated freeform vibes entirely and letting users create their own

**Discovery & recommendations**

- Redesign "What to Read Now" — hide seasonal tagging, surface context-aware picks (season + vibes + current reading patterns). Replace Seasonal Page with a "Recommendations" page linked from "More Recommendations." **[DONE]**
- Recommended New Releases should filter to scores ≥7, not just sort by score **[DONE]**
- Filter New Releases by genre
- When user selects "Not Interested" on a new release, add a form to capture why (e.g. "not interested in comics/graphic novels right now") — useful for future recommendation tuning

**Social & engagement**

- Reading challenges/goals
- Reading timeline visualization
- Integration with e-reader progress
- Social sharing of shelves/lists

**Chat experience**

- Persistent, minimizable chat window that can be triggered from any page and uses that page's context **[DONE]**
- Expand chat tool use — can it access the web (check new releases), remove a book from the library, change book status (e.g. remove from "Reading"), and take other site actions beyond list management?

---

### 🎨 UI Improvements

**Layout & navigation**

- Create a public-facing home page for all users
- Move navigation to collapsible sidebar **[DONE]**
- Make home page closer to screenshot reference
- No direct pagination — need a way to jump to a specific page in Library (currently 46 pages)
- New Release detail box should appear directly under selected book, not at bottom of page **[DONE]**
- ~~"Up Next" toggle~~ — Removed from UI; low utility vs. lists for reading queues **[DONE]**

**Page redesigns**

- **Book Detail page** — Cover + status/rating/favorite/up next on left; predicted rating, notes, metadata, vibes, summary on right; Notes section below both **[DONE]**
- **Shelf page** — Reference Cosmos screenshot; consider unified cover-based view for entire library with dynamic filtering
- **Vibes page** — Current box layout needs visual refresh
- **Reader Profile page** — More attractive layout, better visuals

**Polish**

- List view styling refinements
- Clean up genres — map to broader Amazon-style categories **[DONE]**