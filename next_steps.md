### 🎟️ Free Launch

Everything free until 1 January 2027, announced publicly, then pricing starts. The risk is less someone breaking in than AI spend and load with nothing to cap them. Measured November 2026: a chat reply costs about 15 cents (4.4 API calls, each resending a prompt of about 57,000 tokens, two-thirds of it the library index), and personal release scoring about $3–5 a month for each reader with a profile from the last 90 days. A reader who imports from Goodreads and chats 20 times a month costs about $7–8, the monthly price.

**Before announcing**

- Anthropic spend limit and alerts **[DONE]** — chat and background jobs workspaces with their own keys, spend limits, and alerts (owner, November 2026). The scripts and conversation review use `ANTHROPIC_JOBS_API_KEY`, and a spend limit, rate limit, or overload shows readers a "busy" message
- Daily spending stop **[DONE]** — `server/spend-guard.ts`: past `DAILY_CHAT_BUDGET_USD` (default $25) in a UTC day, chat and greetings answer "busy". Covers chat only; background jobs are capped by the Console's jobs workspace limit
- Per-reader cap during the free period **[DONE]** — paid readers have a fair-use cap of 100 replies a month (`PAID_MONTHLY_REPLY_CAP`), counted like free readers' messages. The Settings page doesn't show it yet
- Request size limit and onboarding cap **[DONE]** — bodies over 100KB and messages over 10,000 characters are refused, and onboarding chat counts like any other chat after 20 messages
- Profile generation one at a time **[DONE]** — profiles queue and generate one at a time, and no more than 2 background scripts run at once across all schedulers (`server/jobs.ts`)
- Profile scheduler misses readers **[DONE]** — it now lists readers from `user_subscriptions`, every row
- How "free" works — a launch promotion that treats everyone as paid until 1 January 2027, with the caps above. Decide what free readers see on 1 January (syllabi and reading paths locked?), and say it plainly on the pricing page

**First weeks**

- Signup abuse **[DONE]** — the Turnstile widget is on sign-up and email sign-in (`src/components/Turnstile.tsx`). To switch it on: create a Turnstile widget in Cloudflare (Managed mode) for the site's domains and localhost, set `VITE_TURNSTILE_SITE_KEY` in Render and `.env`, deploy, then turn on captcha protection in Supabase Auth with the secret key. Doing it in the other order breaks sign-ups until the deploy
- Per-IP rate limits **[DONE]** — `server/rate-limit.ts` limits every API route per address, and chat per reader too (an address can be faked by calling Render directly; a reader can't). Kept in memory, so limits reset on deploy
- Personal release scoring per reader **[DONE]** — now only on request, see "Personal release scoring on request" below
- Background jobs off the web server **[DONE]** — decided November 2026: a Render background worker (Starter, about $7 a month) runs every scheduler (`server/worker.ts`), and the web service stays on Starter for chat and pages, about $14 a month in all against $25 for a 2GB web instance. The web server stops running jobs when `JOBS_IN_WORKER=true` is set on it, and the worker polls for curation requests every minute. Running since 12 November 2026 (`book-library-app-bg-worker`); the web service has `JOBS_IN_WORKER=true`, lowercase, since the check is exact. Storage isn't a reason to grow the Render server: its disk holds nothing; books, releases, and embeddings live in Supabase
- Separate API keys for chat and background jobs **[DONE]** — done with the Console setup. Recording what each background job costs is under Telemetry
- Record profile generation cost — moved to Telemetry ("Record the cost of every AI call"). Each profile's tokens are already in `reader_profile.generation_context` (`input_tokens`, `output_tokens`, `model`), just not priced or summed. Measured 12 November 2026: the owner's last profile (864 books, Opus 5.5) used 38,600 input and 14,300 output tokens, about $0.44; on Opus 4.5 the same profile used about 2,000 output tokens, so Opus 5.5's longer output (likely its thinking) is two-thirds of the cost. Worth a look under Cost efficiencies: a lower effort setting or Sonnet 5.5 for regenerations
- ISBNdb quota **[DONE]** — plan: 5,000 calls a day (reset at midnight UTC) and 60 a minute. Tested 12 November 2026: a bulk lookup is charged per ISBN (100 ISBNs cost 100 calls), while a search costs one call however many books it returns. So the saving is the shared cache (`server/isbndb.ts`, migration 033): every book any ISBNdb response returns is kept by ISBN, and lookups check it, then the 61,000 ingested releases, before calling, so a book a second reader brings in costs nothing. Bulk lookups (100 a call) make an import enrich in seconds instead of minutes. Every response's remaining quota is shared in `api_quota`, and background lookups stop at 1,000 left so Add Book and chat keep working. Pre-loading a list of popular books was considered and deferred (editions limit the hit rate, there's no good source for the list)
- ISBNdb quota at launch — an import still costs about one call per book the cache doesn't have, so about seven 500-book imports of mostly new books use the day's background share. Watch `api_quota`; if imports hit the limit, options are a bigger ISBNdb plan, author searches (one call returns many of an author's books, which could cover several books in an import), or Open Library as a free fallback for covers and summaries
- Supabase plan **[DONE]** — Pro: 8GB of database included, with more added automatically as it grows (charged per GB), and Micro compute (60 direct connections). The database is 165MB today, 113MB of it releases (growing about 11MB a month). Embeddings take about 3KB per distinct book, so even tens of thousands of readers stay in the low gigabytes. Watch compute (CPU, memory, connections) rather than storage
- Long conversations **[DONE]** — past about 20,000 tokens, the start of a conversation is condensed into a summary (`server/conversation-history.ts`, migration 032), so cost per reply stops growing. Tested on a real 20-message conversation: 14 messages became a 3,800-character summary that kept every book, the reader's views, and open threads, for about 2 cents

**Telemetry, dashboards, and alerting** (owner request, November 2026: track usage, signups, books added, and so on, with the cost of each, for everything that has a lever or a cost, viewable in dashboards with alerts)

- Record the cost of every AI call **[DONE]** — `api_usage` (migration 034) records every Claude, Voyage, and ISBNdb call with its cost: chat-side calls from the server, and every script and job through a wrapped Anthropic client (`server/usage.ts`), per reader where known. Batch API results at half price. Chat usage from `chat_token_usage` was copied in
- Reconcile against Anthropic's own figures **[DONE]** — hourly in the worker (`server/cost-reconciliation.ts`, `ANTHROPIC_ADMIN_API_KEY`): the last 3 complete days of Anthropic's bill per workspace against `api_usage`, shown on `/admin` and alerted when they differ by more than $0.50 and 15%. Spend on the old MoodLib workspace before the key switch (9 and 11 November, from the old key and local testing) was acknowledged so it doesn't alert. Local scripts run with the chat key will show up as gaps, which is the point
- Other paid services and quotas **[DONE]** — ISBNdb calls and remaining quota, Voyage tokens, and database size are on `/admin` and alerted. Server memory: the web server and the worker each report their container's memory (scripts included) and today's peak every 5 minutes (`server/health.ts`, `service_health`), alerted at 85%
- Revenue and profit **[DONE]** — the Stripe webhook records every payment (with Stripe's actual fee), refund, dispute, failed payment, and subscription start and end in `billing_events` (migration 036). `/admin` shows recurring revenue, paying and complimentary readers, revenue, costs (APIs plus a share of `fixed_costs`), profit this month, break-even, each paid reader's margin, and recent billing. The worker checks Stripe's balance against the webhook's records hourly (`server/stripe-reconciliation.ts`), and alerts on a gap of $1 or more and on any dispute; the daily summary has a revenue line. Fixing this found the Stripe code pinned to an API version the installed library no longer supports: checkout would have crashed on a real purchase (the reader charged but left on the free plan) and renewals wouldn't reset the reply counter. Now on 2026-01-28.clover, the webhook endpoint's version
- PostHog **[DONE]** — `VITE_POSTHOG_KEY` set on the web service 12 November 2026; events arriving
- Product metrics with their cost **[DONE]** — read straight from the database on the admin page: signups, messages, readers signing in and chatting, paid and curating readers, and books added by source (new `books.added_via`). PostHog's browser events start recording once its key is set in Render
- Dashboards **[DONE]** — `/admin`, owner only (`ADMIN_USER_IDS`): spend today and this month, daily cost by area, cost by feature and per reader, activity, quotas, and job health (`job_heartbeats`). PostHog for product analytics (funnels, retention) alongside
- Alerts **[DONE]** — email through Resend from the worker (`server/alerts.ts`), every 15 minutes, each once per period: spend past $10 a day, chat paused by the daily stop, 20+ signups in an hour, failing or stalled jobs, ISBNdb at its reserve, Voyage free tokens at 80%/95%, the database at 80%, readers at the reply cap, and billed-against-recorded gaps. Daily summary of the day before after 14:00 UTC. The worker can't report its own crash (the web server's silence is alerted, the worker's isn't): Render's failure emails cover that

**Cost efficiencies** (ranked by possible saving; measured from `chat_token_usage` where noted)

- Personal release scoring on request **[DONE]** — "All" is now Notable (general score 6 or more, about a quarter of kept releases), and personal scores are only given to readers who press "Curate for me", on notable releases, for each new month while they keep visiting Releases (60 days). Readers who never open Releases cost nothing. On the owner's scores, the 6+ cutoff keeps 617 of 699 personal 7+ picks; lower it to 5 (679 of 699, twice the cost) if readers say good books are missing. Scoring single titles on click was considered and rejected: personal scores exist to surface the few picks among thousands, and on-click scoring can't
- Chat cache rewrites (measured: 58% of chat cost) **[DONE]** — the prompt is now three cached blocks, least often changed first: instructions (shared by every reader on a plan), profile and library, then syllabi, memory, and the date, all with the 1-hour cache. A syllabus edit rewrites only the last block (6,500 tokens), and a new reader's first message reads the shared 6,700. On a real three-message conversation with a 6-minute pause: 14.8¢ instead of 19.7¢. The trade: a first message costs more (9.2¢ instead of 5.9¢), so readers who send one message and leave cost more, and readers who pause 5–60 minutes while reading (41% of the owner's messages, 12% of testers') cost much less. If launch traffic is mostly single messages, switch PROMPT_CACHE in server/index.ts back to 5 minutes. Before: 14 of 17 replies began by rewriting the whole prompt into the cache. The syllabus index, profile, and date share one cached block with the library index, so any change rewrites all of it; the 5-minute cache also lapses in ordinary reading pauses. Split the prompt into blocks by how often they change, with a 1-hour cache on the library index. The index query also has no `ORDER BY`, so its order can shift after an update and break the cache on its own
- Cache the conversation, not only the system prompt (measured: 17% of chat cost) **[DONE]** — automatic caching on the request: each tool call in a reply reads the conversation so far instead of resending it at full price. Before: each of a reply's tool calls resends the whole conversation and tool results at full price. Add automatic caching for the conversation tail
- Batch API for tagging and predicted ratings **[DONE]** — the background job runs vibe tagging, classification tagging, and predicted ratings with `--batch` (`scripts/claude-batch.ts`): up to 500 books in one Message Batches request at half price, instead of 10 books (20 predictions) every 5 minutes. A batch still running after an hour is canceled and the rest picked up next cycle; a cycle waiting on a batch keeps the job's heartbeat fresh, and one running past 4 hours is reported as failing. Predictions also cache the reader's profile across requests. Tested November 2026 on 100 fiction, 60 nonfiction, and 26 poetry books: every batch finished within minutes with no errors
- Load memory into the prompt **[DONE]** — the built-in memory tool made the API add an instruction to check memory before every reply, so almost every reply began with one or two extra calls. It's now a custom `update_memory` tool, with the reader's memory loaded into the prompt as its own cached block. On 14 test replies: 24 API calls instead of 48, and $0.30 instead of $0.42 (29% less)
- Release scoring requests **[DONE]** — 25 releases per request instead of 10, and the system prompt cached, so a reader's profile (about 6,200 tokens) is paid for once a run and read at a tenth of the price after; caching works within a batch. Tested November 2026 on 150 November releases, 10 vs 25 per request: scores within 1 point 99% of the time, correlation with the saved scores the same (general 0.86 vs 0.88, personal 0.93 vs 0.92). Personal scoring costs about 47% less; general scoring about 8% less (its prompt is too short to cache, and most of its cost is the rationales)
- Haiku 5.5 for vibe and classification tagging — tested and not adopted (November 2026). Readers had confirmed only 3 tags, so Haiku and a fresh Sonnet run each tagged the same books and were compared with the saved Sonnet tags; Sonnet's own rerun is the bar. Overlap with the saved tags, Sonnet rerun vs Haiku: vibes 64% vs 58%, nonfiction 83% vs 71%, poetry 81% vs 67%. Haiku gives fewer vibes (2.0 a book against 2.5) and drops the subtler ones (atmospheric 20 to 10, slow burn 11 to 2, sincere 13 to 6). In batch mode Sonnet tags 100 books for about 6 cents, so a 500-book import costs about 30 cents: the saving isn't worth the tags. Retry with `--model` and `--compare` if a newer small model comes out
- Chat effort `medium` → `low` — tested November 2026 on the owner's 12 real messages, replayed with their conversations (reads for real, changes pretended): low cost 4.5% less once cached ($0.197 against $0.206 for the 12), with 6% fewer output tokens and the same number of API calls. Replies were close in depth and voice; low acted more readily (rebuilt a syllabus where medium proposed an order first, marked a book as reading when the reader said they'd started it). Owner's decision pending
- Not worth it now: the library index behind a tool (decided; about 1.5 cents a reply once cached), summarizing or clearing long conversations (they're short), tool search (too few tool definitions), a cheaper chat model

---

### 💬 Chat

**Security** (both open items are launch blockers, see Free Launch)

- Verify login tokens — the server read the user ID from the token without checking its signature, so a forged token could delete another reader's account or open their billing portal, and any bearer value could use the ISBNdb proxy. Every endpoint now checks with Supabase **[DONE]**
- Malformed chat requests — `JSON.parse` in `handleChat` sat outside any `try`, and nothing caught the rejection, so a signed-in user sending bad JSON could crash the server for everyone. It now returns a 400, and unexpected failures in chat and the ISBNdb proxy return an error instead of reaching the top level **[DONE]**
- Free message counter — it was checked before the reply and counted after, so requests sent together could all pass the limit. A message is now claimed up front and returned if the reply fails **[DONE]**
- Onboarding chat has no limit **[DONE]** — capped at 20 messages, then it counts against the monthly limits
- Request size limit **[DONE]** — 100KB per request body

**Conversations get a subject**

- Link a conversation to a book — `book_id` on `conversations`. Nothing connects the two today, so earlier chats about a book can't be found **[DONE]**
- "Discuss this book" — resume the latest chat about the book with a clear "Start new" (decided), or start one with openers based on status (focus questions while reading). Today it only fills the text box, overwrites what you typed, and lands in whatever chat is open **[DONE]**
- Book context for the AI — send the book to the server, and give the AI a card with its summary, notes, dates, rating, excerpts, and list context. It can't see any of these today **[DONE]**
- Conversation links — `/chat/:id`, so "View conversation" opens the right one **[DONE]**
- Manage conversations — new chat and a conversation list in the panel, rename, delete, sort by latest activity, and load past the 20 most recently started. Deleting keeps excerpts (the foreign key already sets `conversation_id` to null), and says plainly that memory and the profile can't be traced back to one chat (decided) **[DONE]**
- Book page conversations — list conversations about the book alongside its excerpts, and hide the empty placeholder **[DONE]**

**Quick context wins**

- Load memory automatically, with a size cap **[DONE]** — in every chat prompt, with a 12,000-character limit (about 3,000 tokens) across a reader's files. Writes past it are refused and the AI condenses
- Refresh the library index after the AI changes a book — it can be 10 minutes out of date, even about its own changes
- Save a short record of each AI action — only message text is saved, so in later turns the AI has no record of what it did
- Make the prompt plan-aware — free users are told about syllabus, path, and excerpt tools they don't have
- Home greeting fixates on one book — every greeting for the owner is about Ligotti's "Dream of a Manikin", a story from a collection shelved as unfinished, while five books are in progress and more recent conversations were about other books. Found in November 2026 (`server/greeting-handler.ts`): the greeting only sees the first 1,000 characters of the reader profile, the last three messages of one conversation, and the date. It never sees what the reader is reading. The owner's profile (generated 27 October, after the June Ligotti conversation) mentions Ligotti, the manikin story, and the "puppeteer" fear in those first 1,000 characters, and the latest conversation (a correction about book-club page counts) names no book, so the profile excerpt wins every time. It also picks the conversation most recently started, not most recently active. Fix: give it the books being read (with start dates) and the most recently active conversation and its book, use the profile for tone rather than topic, leave out unfinished books, and avoid repeating what recent greetings said

**Trust and reliability**

- Show AI actions in the thread — "Added *Dune* to wishlist" with a link, and refresh the page behind the panel. Today actions are invisible
- Stop and retry — `abortRef` is set but never used, and there's no way to resend after an error
- Stuck and lost replies — a stream that ends without `done` leaves chat "streaming" until reload, and errors lose the partial reply
- New Chat during a reply — `newChat` isn't guarded, so the reply can land in the new chat **[DONE]**
- Formatting — replace the hand-written formatter with proper markdown, and link book titles
- Free limit — show it before someone types, keep the counter current, and don't lose the typed message
- Phone layout — `/chat` uses `100vh`, which probably runs behind mobile browser bars. Check on a device
- Conversation titles — generated after the client refreshes its list, so a new chat probably shows no title until the next refresh **[DONE]**

**Excerpts**

- "Save to book" on any message, so saving doesn't depend on the AI offering. No user has ever saved an excerpt, and only one assistant message has ever offered **[DONE]**
- Save without announcing — the "no narration" rule is deliberate, because announcing saves felt clunky. What's worth keeping is saved after a book conversation goes quiet, and the live chat only saves when asked. Chats started from a book page save to that book, with no title matching **[DONE]**
- Automatic saving for general chats — only conversations started from a book page are reviewed. Extend it to general chats that discuss a book once this has proven itself
- Deleted excerpts can come back — resuming a conversation reviews it again, and the review can't see what the reader deleted. Keep deleted text as a tombstone if this happens in practice
- Tell the reader when a save fails — a title that doesn't match is currently never mentioned, and a partial match can attach to the wrong book **[DONE]** for the AI, which is now told to say so
- Feed excerpts into the profile — book context has them now **[DONE]**, but profile generation still doesn't read them
- Free readers can save by hand (decided), since it costs nothing to run. Saving done by the AI stays on the paid plan, since it costs API calls **[DONE]**

**Long-term continuity**

- "What your companion remembers" — view, edit, and delete memory. Readers can't see it today
- Export — conversations, memory, excerpts, and the profile. The only export is the book CSV
- AI tools to read a book's details and search past conversations
- Conversation summaries, and condensing the older parts of very long conversations **[DONE]** for condensing; see "Long conversations" under Free Launch. One-line summaries of book conversations come from the review step
- Better profile input — it reads the last 100 messages cut to 500 characters each, skips excerpts, and can take about 30 days to reflect a conversation. The first profile skips onboarding chat entirely
- Prompt caching **[DONE]** — the prompt now uses the 1-hour cache; see "Chat cache rewrites" under Free Launch
- Library index tiering **[DONE]** — the prompt now lists only what the reader is reading, has read, rated, or marked a favorite (85 lines and 3,400 tokens for the owner's 909 books, from 38,900), and the AI finds unread books and the wishlist with a `search_library` tool. The cached prompt went from about 57,000 tokens to 22,000. Next stages discussed: core memory loaded automatically (**[DONE]**, see "Load memory into the prompt"), embeddings in Supabase (pgvector), then theme clusters per reader (also the basis for Reading Life eras)
- Book embeddings and search by meaning **[DONE]** — every book is embedded from its title, author, genre, and summary with Voyage `voyage-4`, and `search_library` can search by description (`about`) or find books like one in the library (`like_title`). Vectors are shared between libraries by text, so a popular book is embedded once. The first fill was 1,704 books and 488,000 tokens in 34 seconds, inside Voyage's 200 million free tokens. Memory didn't need embeddings once it was in the prompt
- Embed excerpts and conversation summaries — none exist yet. When they do, a recall tool for past conversations ("what did I say about Ligotti?") can use the same `text_embeddings` table
- Cap the read list in the prompt for heavy readers, with theme clusters — a reader with 1,500 read books still sends about 65,000 tokens of index on every call. Keep favorites, rated, and recent reads in full, and cover the rest with clusters of their embeddings ("19 polar and survival books, mostly 4–5★"); search by meaning finds the individual books. Deferred in November 2026: clusters from book summaries alone would mostly repeat the profile's thematic pillars. They become worth building with this cap, or once readers have months of excerpts and conversation summaries to cluster
- Reading Life eras — clusters over time. Needs finish dates: Goodreads imports have them for most read books (331 of 387, 159 of 259 for the two testers), but the owner's 70 read books have none
- "Releases like books you loved" — compare release synopses to the reader's favorites by embedding, as a free first pass before personal scoring

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
