### 💬 Chat

**Security**

- Verify login tokens — the server read the user ID from the token without checking its signature, so a forged token could delete another reader's account or open their billing portal, and any bearer value could use the ISBNdb proxy. Every endpoint now checks with Supabase **[DONE]**
- Malformed chat requests — `JSON.parse` in `handleChat` sits outside any `try`, and nothing catches the rejection, so a signed-in user sending bad JSON can probably crash the server. Return a 400 instead
- Free message counter — read then written rather than updated atomically, so requests sent at the same time can slip past the limit

**Conversations get a subject**

- Link a conversation to a book — `book_id` on `conversations`. Nothing connects the two today, so earlier chats about a book can't be found
- "Discuss this book" — resume the latest chat about the book with a clear "Start new" (decided), or start one with openers based on status (focus questions while reading). Today it only fills the text box, overwrites what you typed, and lands in whatever chat is open
- Book context for the AI — send the book to the server, and give the AI a card with its summary, notes, dates, rating, excerpts, and list context. It can't see any of these today
- Conversation links — `/chat/:id`, so "View conversation" opens the right one
- Manage conversations — new chat and a conversation list in the panel, rename, delete, sort by latest activity, and load past the 20 most recently started. Deleting keeps excerpts (the foreign key already sets `conversation_id` to null), and says plainly that memory and the profile can't be traced back to one chat (decided)
- Book page conversations — list conversations about the book alongside its excerpts, and hide the empty placeholder

**Quick context wins**

- Load memory automatically, with a size cap — today it's only read if the AI chooses to check, and there's no limit on its size
- Refresh the library index after the AI changes a book — it can be 10 minutes out of date, even about its own changes
- Save a short record of each AI action — only message text is saved, so in later turns the AI has no record of what it did
- Make the prompt plan-aware — free users are told about syllabus, path, and excerpt tools they don't have

**Trust and reliability**

- Show AI actions in the thread — "Added *Dune* to wishlist" with a link, and refresh the page behind the panel. Today actions are invisible
- Stop and retry — `abortRef` is set but never used, and there's no way to resend after an error
- Stuck and lost replies — a stream that ends without `done` leaves chat "streaming" until reload, and errors lose the partial reply
- New Chat during a reply — `newChat` isn't guarded, so the reply can land in the new chat
- Formatting — replace the hand-written formatter with proper markdown, and link book titles
- Free limit — show it before someone types, keep the counter current, and don't lose the typed message
- Phone layout — `/chat` uses `100vh`, which probably runs behind mobile browser bars. Check on a device
- Conversation titles — generated after the client refreshes its list, so a new chat probably shows no title until the next refresh

**Excerpts**

- "Save to book" on any message, so saving doesn't depend on the AI offering. No user has ever saved an excerpt, and only one assistant message has ever offered
- Save without announcing — the "no narration" rule is deliberate, because announcing saves felt clunky, so the AI shouldn't offer or ask in prose. Choose between saving silently during the chat and a pass after the conversation ends, then remove the prompt's "offer" and "always confirm" instructions. Chats started from a book page save to that book, with no title matching
- Tell the reader when a save fails — a title that doesn't match is currently never mentioned, and a partial match can attach to the wrong book
- Feed excerpts into the profile and book context — they only reach the book page today
- Free readers can save by hand (decided), since it costs nothing to run. Saving done by the AI stays on the paid plan, since it costs API calls

**Long-term continuity**

- "What your companion remembers" — view, edit, and delete memory. Readers can't see it today
- Export — conversations, memory, excerpts, and the profile. The only export is the book CSV
- AI tools to read a book's details and search past conversations
- Conversation summaries, and condensing the older parts of very long conversations — history has no limit, so a very long one will eventually fail
- Better profile input — it reads the last 100 messages cut to 500 characters each, skips excerpts, and can take about 30 days to reflect a conversation. The first profile skips onboarding chat entirely
- Prompt caching — the cache lasts 5 minutes, shorter than many pauses in a conversation about a book, so consider a longer one
- Library index — keep sending the whole index on every call for now (decided). Each call sends about 45,000 tokens on average, 51,000 at most, and a reply averages about four calls. A deeper look at how context gets served is planned for later

---

### 📖 Book Page

**First pass**

- Author links — author name on the book page opens the library filtered to that author, with each co-author linked separately **[DONE]**
- "Also by" section — other books by the same author in the reader's library, unread first, with rating or status on each cover and "See all" for prolific authors **[DONE]**
- Fix tagging — the scheduler compared book counts to tag row counts, so it stopped early (about two tags per book). The scripts also only read the first 1,000 rows, so they kept re-tagging the same books and never reached the rest **[DONE]**

**Next**

- "Similar to This" section — AI picks about 6 books from the reader's own library with a one-line reason for each, using summaries and reader profile. Save results after first view, leave out same-author books, start on the paid plan since each first view costs an API call. Tags alone are too thin and too broad for this
- Show which lists a book is on — "Here, Thankful, Real, #13" with a link, and the focus questions on the book page, especially while reading **[DONE]**
- Make "Discuss this book" prominent — chat is the core loop, but it's a small link just above "Remove from library"
- Order the page by status — unread leads with predicted rating and summary; read leads with rating, notes, and conversations. Notes currently sit below metadata for every book **[DONE]**
- "From Conversations" — hide when empty, and find out why no user has a saved excerpt (the tool is paid-only, so free users can never fill it). "View conversation" should open that conversation, not the general chat page
- Reading dates — set start and finish dates on the book page, filled in automatically when the status changes. No page tracking, which would push toward logging progress **[DONE]**
- Tidy the left column — move the raw cover URL and ISBN fields into "Edit details" now that "Change edition" exists **[DONE]**
- Small fixes — excerpt delete button only appears on hover, so touch screens can't reach it; "← Back" leaves the app when a book page was opened directly **[DONE]**
- Predicted rating voice — reasons read like notes about someone else ("Directly on his consciousness syllabus"). The prompt asks why "this reader" would rate the book that way, so the text talks about the reader, and it guesses at gender. Speak to the reader as "you" instead. New-release reasons use the same wording, so check those too. Saved reasons stay as they are until predictions are re-run, which costs API calls

**Investigate**

- Duplicate syllabus — one syllabus appears to have been created twice, with a slightly different title and description but what looks like the same books. Find out whether this was a one-time thing or whether something in creating a syllabus can repeat, such as the AI calling the tool again or a retry
- 1,000-row limit elsewhere — Supabase silently returns at most 1,000 rows per request, which is what stalled tagging. Check the other scripts and server code for queries that can pass it, and use `scripts/fetch-all.ts` where they do
- Narrators and illustrators stored as authors — ISBNdb lists them with no role ("Robert Jordan, Rosamund Pike"; one audiobook lists over 100 people). The book page caps the list and only gives the first two names an "Also by" section, but a narrator can still get a section or a filter of their own. Consider cleaning the data on the way in
- Missing data — no book from any user has a genre, series, or "when to read" month, though `CLAUDE.md` says about 917 should have timing. The library's genre filter has nothing to offer and seasonal recommendations have no data behind them. Find out when and why, then restore or remove

---

### 🚀 Alpha Launch

**Tier 1: Launch Blockers**

- ~~Early profile generation after N books/ratings~~ **[DONE]**
- Account settings page — password reset + delete account (table stakes for real users) **[DONE]**
- Custom domain + deployment finalization — live URL, DNS, SSL **[DONE]**
- CORS restriction — lock `Access-Control-Allow-Origin` to app domain (currently `*`; auth tokens in flight) **[DONE]**
- Goodreads/CSV import — onboarding accelerator; empty library → value in minutes instead of hours **[DONE]**
- Contact form backend — `ContactPage.tsx` shows success but never sends data; broken form on a public page is a bad look **[DONE]**

**Tier 2: High-Value Alpha Experience**

- Post-add enrichment pipeline — when books enter the library (import, manual add, or AI tool), automatically run ISBNdb enrichment, predicted ratings, vibe tagging, and classification tagging. Needs thoughtful design: rate limiting (ISBNdb 1 req/sec), prioritization (covers first for visual impact), batching strategy, and a unified trigger regardless of entry point **[DONE]**

- ~~Chat tone tuning~~ **[DONE]**
- Empty states for new users — Home, Recommendations, Profile show blank if no data; guide users instead **[DONE]**
- Profile generation notification — toast/banner on next visit when profile generates or regenerates **[DONE]**
- Filter by predicted rating on All tab **[DONE]**

**Tier 3: Polish**

- Shelves page performance — profile bottleneck, optimize if simple **[DONE]**
- ISBNdb API key cleanup — `VITE_ISBNDB_API_KEY` still in browser bundle; make server-only **[DONE]**
- Code splitting — 760KB bundle; lazy-load lower-priority routes **[DONE]**

**Code Hygiene**

- BookDetail.tsx navigation hack — `to={-1 as unknown as string}` type cast; fragile **[DONE]**
- Silent error swallowing on Home page — `.catch(() => [])` hides failures from users **[DONE]**

---

### 🐛 Bugs

- Need to be able to remove a book from library **[DONE]**
- Add any missing metadata into empty fields; ensure data is as clean as possible **[DONE]**
- On all pages with multiple pages of books, you can't go directly to a specific page — have to cycle through them **[DONE]**
- New releases are once again showing all new releases in descending order for recommended, rather than only showing those that score at least 7 **[DONE]**

---

### ✨ Features

**Core functionality**

- Document the app / create a GitHub readme **[DONE]**
- User signup and profile creation **[DONE]**
- Deploy to cloud (Vercel/Cloudflare Pages + serverless) **[DONE]**
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

- Design first-class experience for non-fiction and poetry — adaptive hybrid architecture chosen. Design docs at `.claude/design/`. Data foundation complete: `book_type` column on books (backfilled: 1088 fiction, 595 nonfiction, 18 poetry), `tag_category` on book_vibes, `canonical_tags` table seeded with 57 tags across 7 categories. **[DONE]**


**Social & engagement**

- Reading paths — interest-driven explorations (author catalogs, literary movements, award lists) with progress tracking and AI-assisted creation/check-ins. Stretch: AI-generated "seminar" layer — structured syllabi with deliberate sequencing, historical/cultural context before each work, guided reading focus, post-book discussion, and adaptation based on the reader's reactions throughout the path **[DONE]**
- ~~Reading Life narrative~~ — moved to Deferred Backlog
- Onboarding flow — multi-step guided experience for new users to accelerate profile generation and personalization. Collect preferences (vibe selection from canonical vibes, book type preferences, initial ratings of well-known books), seed the reader profile faster than waiting for organic activity. Could also include genre/topic interests, reading pace, and "what are you reading now?" **[DONE]**
- ~~Social features strategy~~ — moved to Deferred Backlog

**Chat experience**

- Persistent, minimizable chat window that can be triggered from any page and uses that page's context **[DONE]**
- Expand chat tool use — can it access the web (check new releases), remove a book from the library, change book status (e.g. remove from "Reading"), and take other site actions beyond list management? **[DONE]**
- Add web access tool to chat (e.g. search for books, look up author info, check reviews) **[DONE]**
- Full data export (JSON) — books, syllabi, reading paths, conversations, excerpts, memory, reader profile. Richer complement to the CSV library export for users who want a complete backup **[DONE]**
- ~~Smoother reading path creation for books not in library~~ — when chat creates a syllabus or reading path, books not in the library are now auto-added as wishlist items **[DONE]**
- Future cost optimization strategies to evaluate when we have usage data:
  - Alternative model providers (e.g. DeepSeek) for chat to reduce per-message cost
  - Intelligent model routing — Sonnet for complex messages, Haiku for simple ones (or Sonnet for first N messages, Haiku after)
  - Generous first-month free tier (unlimited messages month 1, then drop to 5/month) to accelerate onboarding
  **[DONE for now — revisit when usage data available]**

---

### 🎨 UI Improvements

**Layout & navigation**

- Create a public-facing home page for all users **[DONE]**
- Move navigation to collapsible sidebar **[DONE]**
- Make home page closer to screenshot reference **[DONE]**
- No direct pagination — need a way to jump to a specific page in Library (currently 46 pages) **[DONE]**
- New Release detail box should appear directly under selected book, not at bottom of page **[DONE]**
- ~~"Up Next" toggle~~ — Removed from UI; low utility vs. lists for reading queues **[DONE]**

**Page redesigns**

- **Book Detail page** — Cover + status/rating/favorite/up next on left; predicted rating, notes, metadata, vibes, summary on right; Notes section below both **[DONE]**
- **Shelf page** — Reference Cosmos screenshot; consider unified cover-based view for entire library with dynamic filtering **[DONE]**
- **Vibes page** — Current box layout needs visual refresh **[DONE]**
- **Reader Profile page** — More attractive layout, better visuals **[DONE]**

**Polish**

- List view styling refinements **[DONE]**
- Clean up genres — map to broader Amazon-style categories **[DONE]**
- Redesign star rating input — replace dropdown with interactive star widget (Letterboxd-style hover/tap with quarter-star precision). Current dropdown is bulky and unattractive **[DONE]**
- Add accent color — find strategic places for splashes of a warm color (e.g. LitHub-style red hue) to break up the neutral palette **[DONE]**
- Rename "Freeform Vibes" to "Tags" on BookDetail — the old label is confusing now that AI freeform vibes are gone, and users will tag with more than just vibes **[DONE]**

---

### 💰 Business Track

- Monetization implementation — usage-gated free tier + paid subscription. See pricing strategy at `.claude/design/pricing-strategy.md` and implementation plan at `.claude/plans/monetization-plan.md` **[DONE]**
- AI cost optimization — token tracking implemented; batch API for releases scoring implemented; system prompt compression implemented. Monitor usage data before further optimization **[DONE]**
- Verify all documentation is current — README, CLAUDE.md, any user-facing docs. Ensure they reflect current features, architecture, and pricing model **[DONE]**
- Alpha launch plan — define launch strategy: target audience, distribution channels, feedback collection, success metrics, and timeline. See `.claude/design/launch-plan.md` **[DONE]**

---

### 📋 Backlog (Deferred)

- Account settings page design refinement — revisit when we think of what else to add to settings
- Add Book search noise — hard to find the right book for famous authors (Rushdie, etc.); consider result filtering, ranking by relevance, or alternative search strategies **[DONE]**
- ~~Reduce reading path creation friction~~ — books not in library are now auto-added as wishlist items during syllabus/reading path creation **[DONE]**
- Custom SMTP provider for auth emails — Supabase default emails are generic and unbranded; evaluate Resend, SendGrid, or Postmark for branded transactional emails (confirmation, password reset)
- Reading Life narrative — AI-identified eras/chapters in the reader's journey (not a chronological timeline but a thematic story), with key books, transition points, vibe/genre composition, and conversation insights per era. First step: add `date_read` column to books (set automatically when status changes to "read") so temporal data accumulates over time
- Social features strategy — determine which social interactions serve meaningful reading vs. social performance. Candidates: editorial public lists with write-ups, sharing reader insights/profiles (not metrics), seminar cohorts on reading paths, taste-based discovery
