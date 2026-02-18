# Rekollekt User Guide

Rekollekt is a personal book library app designed for readers who want more than a reading tracker. It uses AI to understand your tastes, predict what you'll love, and help you reflect on your reading life. This guide covers everything you can do in Rekollekt.

---

## Getting Started

Rekollekt requires an account. Visit the landing page and sign up with your email and password, or use Google OAuth. Once signed in, you'll be guided through a short onboarding flow.

### Onboarding

New accounts start with a two-step setup:

1. **Welcome gate** — Choose how to begin: import your Goodreads library, jump into a conversation with the AI, or skip setup entirely.
2. **Onboarding chat** — If you choose to chat, the AI reading companion helps populate your library through natural conversation. It asks about books you love, adds them as you mention them, and starts learning your taste. Messages during onboarding are free and don't count toward the monthly chat limit.

You can click "Start exploring" at any time to finish setup and enter the app.

### Importing from Goodreads

If you have a Goodreads account, you can import your library:

1. Export your library from Goodreads: My Books > Import and export > Export Library
2. Upload the CSV file in Rekollekt
3. Select which shelves to import (read, currently-reading, to-read, custom shelves)
4. For "to-read" books, choose whether to import them as Unread or Wishlist
5. Rekollekt detects duplicates by ISBN and title+author — matches are skipped automatically

Import runs in batches with a progress bar. After import, you'll return to the onboarding chat where the AI can see your imported library.

### Free and Paid Plans

Rekollekt offers two tiers:

**Free** — Full library management, shelves, Goodreads import, predicted ratings, monthly reader profile, recommendations, new releases, and 5 AI chat messages per month.

**Reading Companion** ($7/month or $60/year) — Everything in Free, plus unlimited chat messages, AI-created syllabi and reading paths, saved conversation excerpts, and on-demand profile regeneration.

---

## Home

The home page is your personalized landing space. It adapts to the time of day and what you're reading.

**Currently Reading** — If you have books marked as "reading," the hero section showcases the current one with its cover, title, and author. A "Dive Deeper" button opens a conversation about it with the AI reading companion. If you're reading multiple books, dots let you navigate between them.

**Personalized Greeting** — Below the hero, Rekollekt generates a brief, personalized greeting that reflects your current reading activity and interests. Highlighted phrases appear in the app's accent color.

**Picked for You** — Up to five AI-recommended books from your library, each showing its predicted rating. These are books Rekollekt thinks you'd enjoy based on your reading profile. A link leads to the full Recommendations page.

**Recently Added** — The latest books you've added to your library, displayed as cover thumbnails.

**Your Reading DNA** — A stats card showing your read completion percentage as a donut chart, your top author, most common vibe, and total book count.

---

## Library

The library is the heart of Rekollekt — a searchable, filterable view of your entire book collection.

### All Books View

The default view shows all books in a list format with cover thumbnails, titles, authors, and vibe badges.

**Search** — Type in the search bar to filter by title or author. Results update as you type. Toggle "Advanced" for separate title and author search fields.

**Filters** — Expand the filter bar to narrow by:
- Status (unread, reading, read, unfinished, wishlist)
- Minimum rating (user rating or AI-predicted rating)
- Genre
- Page count range
- Publication year range

Active filters are summarized in a line below the bar (e.g., "read, 4+ stars, Sci-Fi, 200-400 pp"). A badge on the filter button shows how many filters are active.

**Pagination** — Books are shown 20 per page with navigation controls at the bottom.

### Gallery Tabs

Three tabs — **Fiction**, **Nonfiction**, and **Poetry** — provide a visual gallery view organized by each type's classification system.

**Fiction** shows your 17 canonical vibes as clickable tag pills (atmospheric, cerebral, dark, intimate, etc.). Select one or more to filter the cover grid.

**Nonfiction** shows tags grouped into three categories: Topics, Form (narrative, analytical, polemic, etc.), and Depth (accessible, moderate, demanding, etc.).

**Poetry** shows tags for Movement (confessional, modernist, etc.), Formal Feel (lyric, prose-like, etc.), and Accessibility.

Each tab displays books as a responsive cover grid. Click any cover to go to its detail page. A "Load more" button appears when more results are available.

### Shelves View

Toggle between the list/gallery view and Shelves using the view control, or navigate directly via the sidebar's "Shelves" link.

**Manual Shelves** — Create a shelf, give it a name and description, then add books from your library. Books are ordered and can be reordered.

**Auto Shelves** — Define filter rules (status, genre, rating, vibes, book type, favorites, etc.) and the shelf automatically populates with matching books. Auto shelves stay current as your library changes.

**Shelf Carousel** — Click into any shelf to enter an immersive full-screen carousel. Browse books in a coverflow-style view with the current book centered and adjacent books peeking above and below. Navigate with arrow keys, scroll wheel, or clicking. The right panel shows book metadata, summary, and classification tags. Press Enter to jump to a book's detail page.

---

## Book Detail

Every book has a detail page showing its full metadata and providing inline editing.

### Editing

Click any of these to edit them directly on the page:
- **Status** — Set to unread, reading, read, unfinished, or wishlist
- **Rating** — Rate from 0.5 to 5 stars (hidden for wishlist books)
- **Favorite** — Toggle the favorite flag
- **Cover Image** — Update the cover URL
- **ISBN** — Edit or add an ISBN
- **Notes** — Your personal notes about the book

### AI Features

**Predicted Rating** — For unread and wishlist books, Rekollekt displays an AI-predicted rating based on your reading profile, along with a brief rationale explaining the prediction.

**From Conversations** — When you discuss a book with the AI reading companion, insightful observations can be saved as "excerpts" that appear here. Each excerpt links back to its source conversation.

**Discuss This Book** — Opens a chat conversation pre-focused on this specific book.

### Additional Information

- **Summary** — Book synopsis from ISBNdb
- **Classifications** — The book's vibe/topic/movement tags with an editor to add, remove, or confirm AI-assigned tags
- **Awards** — Any literary awards the book has won or been nominated for (winner, shortlist, longlist, nominee)
- **Metadata** — Book type, genre, page count, publication year, publisher, format, and reading dates
- **Purchase Link** — For wishlist books, a link to Bookshop.org

---

## Adding Books

Navigate to "Add Book" from the sidebar footer. Rekollekt searches the ISBNdb database to find books.

**Search** — Enter a title, author name, or ISBN. Results are grouped by edition so you see one entry per work rather than dozens of editions.

**Preview** — Click a result to see its full details: cover, metadata, and synopsis. Rekollekt auto-detects the book type (fiction, nonfiction, or poetry) from the book's subjects — you can override this before adding.

**Add to Library** — Choose a reading status and add the book. If the ISBN already exists in your library, Rekollekt warns you and links to the existing entry.

**Wishlist** — Use the "Wishlist" button to add a book you want to read but don't own yet.

---

## Syllabi

Syllabi are curated, editorial reading collections — think of them as themed course reading lists for your personal library. They differ from shelves in two key ways: each item can have a **rationale** explaining why it belongs, and syllabi can include **books not in your library**.

### Course Catalog

The syllabi index page shows all your syllabi in an editorial card layout. Each card displays a cover thumbnail from the first book, the item count, a relative update date, and the syllabus description. AI-generated syllabi (created by the reading companion) show a "Rekollekt Generated" badge.

### Creating a Syllabus

Click "Create Syllabus" and provide a name and optional description. You can also ask the AI reading companion to create one for you during a chat conversation.

### Syllabus Detail

Each syllabus shows its items in a numbered editorial layout. For each item:

- **Position number** — Zero-padded (01, 02, 03...)
- **Cover thumbnail** — Book cover or placeholder
- **Title and author** — Title links to the book detail page for library books
- **Rationale** — An italic explanation of why the book belongs. Click to add or edit. The AI companion fills these in when it creates syllabi.

**Adding items** — Click "Add Item" to open the search modal. This searches both your library and ISBNdb simultaneously:
- **Library results** show an "In Library" badge
- **ISBNdb results** show "Not in library" — these are added as external items

**External items** appear with an amber background and a "Not in library" badge. If the book has an ISBN, an "Acquire Copy" link opens Bookshop.org.

**Reordering** — Hover over any item to reveal up/down arrows for reordering, or an X to remove it.

**Editing** — Click the syllabus title or description to edit them inline.

---

## Reading Paths

Reading paths are structured intellectual journeys — thematic deep-dive explorations with seminar-style scaffolding. Where syllabi are flat curated lists, reading paths add deliberate sequencing, pre-reading context, focus questions, and post-reading reflection prompts.

### Creating a Reading Path

Reading paths are created exclusively through the AI reading companion. Ask the companion to build a path around a topic, literary movement, or theme (e.g., "Create a reading path exploring the New Sincerity movement"). The AI will:

- Set a **thesis** framing the path's intellectual arc
- Sequence books in a deliberate order
- Generate **seminar content** for each book: pre-reading context, focus questions, and post-reading prompts
- Add books from your library or as external items (if you don't own them yet)

### Viewing Reading Paths

Reading paths appear alongside syllabi on the Syllabi page, with a "Reading Path" badge and filter tabs to switch between types. Each path card shows a progress bar and the thesis.

### Path Detail Page

The detail page shows the path's thesis prominently, followed by a progress summary ("2 of 6 books completed"). Each item includes:

- **Progress badge** — Click to cycle through not_started > reading > completed. Marking a book completed automatically updates its library status to "read."
- **Pre-reading context** — Why this book is positioned where it is and what to watch for
- **Focus questions** — 2-4 questions to consider while reading (expandable)
- **Post-reading prompts** — Reflection starters after finishing (expandable, visually gated until the book is completed)
- **Discuss this book** — Opens a chat conversation with the path's context, so the companion can reference focus questions and themes

### External Items and Auto-Linking

When the AI creates a reading path, books not in your library are stored as external items with all their seminar content preserved. When you later add one of these books to your library through the Add Book page, it automatically links to the existing path item — no manual reconnection needed.

---

## AI Reading Companion

The reading companion is an AI chat interface powered by Claude. It's designed to be an empathetic, knowledgeable reading partner — not a search engine.

### Accessing Chat

- **Full page** — Click "Chat" in the sidebar for the full-page experience
- **Floating panel** — Click the chat bubble button in the bottom-right corner of any page to open a compact chat panel. On mobile, it slides up to fill most of the screen.
- **From a book** — Click "Discuss this book" on any book detail page to start a conversation about that specific book.

### What the Companion Can Do

The reading companion has access to your entire library and can take actions on your behalf:

**Discuss books** — Talk about what you're reading, how it's affecting you, and what connections you see to other books. The companion approaches fiction, nonfiction, and poetry differently — exploring emotional resonance for novels, ideas and arguments for nonfiction, and language and form for poetry.

**Manage your library** — Tell the companion you started, finished, or gave up on a book, and it will update the status. It can also set ratings, mark favorites, add new books, and remove books.

**Create syllabi** — Ask the companion to build a themed reading list. It will create a syllabus, add books from your library, and provide rationale for each selection. It always confirms before creating.

**Build reading paths** — Ask the companion to create a structured reading path around a topic or literary movement. It will design a deliberate sequence with seminar content for each book.

**Manage your wishlist** — Mention a book you want to read, and the companion can add it to your wishlist.

**Save insights** — When a conversation surfaces a compelling observation about a book, the companion can save a polished excerpt to the book's detail page under "From Conversations."

**Browse new releases** — Ask about upcoming books, and the companion can search the releases pipeline and tell you what's scoring well.

**Remember you** — The companion uses persistent memory to remember your preferences, emotional reactions, and evolving tastes across conversations. It checks its memory at the start of each conversation and records meaningful new insights.

### Conversation Starters

Not sure what to talk about? Here are some prompts that showcase what the companion does best:

- **"I just finished [book title] and I'm not sure what to read next."** — The companion will ask what worked about that book, connect it to patterns in your library, and suggest what to pick up next based on what you're in the mood for.

- **"What connections do you see between my favorite books?"** — The companion reads across your library and surfaces thematic threads you might not have noticed — recurring obsessions, emotional patterns, or aesthetic preferences that link seemingly unrelated books.

- **"Build me a reading path around [theme or movement]."** — For paid users, the companion designs a structured intellectual journey with sequenced books, pre-reading context, focus questions, and post-reading prompts.

- **"I've been thinking about [idea from a book] — what else in my library touches on that?"** — The companion draws cross-library connections, linking fiction to nonfiction to poetry when relevant. It treats your library as a conversation between authors.

- **"What's coming out this month that I might like?"** — The companion searches new releases scored against your profile and explains why specific books match your taste.

### Conversations

Each chat creates a conversation that's titled automatically after the first exchange. You can start new conversations or return to previous ones through the conversation list panel.

### Free Tier Limits

Free accounts get 5 chat messages per month. The counter resets at the start of each month. A message count appears in the chat interface so you always know how many you have left. Onboarding messages don't count.

---

## Reader Profile

Your reader profile is an AI-generated portrait of who you are as a reader. It's displayed as a full-screen, snap-scrolling slide deck.

### Profile Sections

**Reader Identity** — A narrative description of your reading personality, themes you gravitate toward, and what drives your book choices.

**Thematic Pillars** — The core themes that run through your reading life, each with a description and example books from your library.

**Taste Evolution** — How your tastes are currently shifting, what has been consistent over time, and a log of notable taste shifts.

**Emotional Patterns** — How you engage emotionally with books — what triggers strong reactions, what you find comforting, what challenges you.

**Beyond Fiction** — If your library includes nonfiction or poetry, dedicated sections describe your nonfiction intellectual identity and interests, and your poetry sensibility and poet affinities.

**Personal Canon** — The books that define you as a reader. This is the one editable section — you can add and remove books using the search modal to curate your personal canon.

**Reading Life** — A statistical snapshot: status breakdown, currently reading, recently finished, and a description of your reading pace.

### Profile Regeneration

Your profile regenerates periodically (roughly monthly) when Rekollekt detects meaningful new activity — new books read, ratings added, conversations held, or notes written. This happens automatically in the background.

---

## Recommendations

The Recommendations page shows your top AI-predicted picks — up to 20 unread or wishlisted books ranked by predicted rating. Each book appears as a cover card with its predicted score.

Predictions are generated by the AI based on your reader profile, rating history, and the classification data for each book. Books are calibrated against others of their type (fiction predictions use fiction ratings as calibration, etc.).

---

## New Releases

The Releases page lets you discover upcoming books that have been scored for personal relevance.

**Browsing** — Select a month and year from the dropdown. Books are displayed in a responsive cover grid.

**Sorting** — Toggle between "Recommended" (sorted by AI personal match score) and "All" (alphabetical). A category filter lets you view All, Fiction, or Nonfiction releases.

**Score Badges** — Each book shows a color-coded score badge:
- Amber (8+) — Strong match
- Green (6+) — Good match
- Neutral (4+) — Moderate match

Books already in your library show an "In Library" badge.

**Detail View** — Click any book to expand an inline detail card showing the full synopsis, subjects, and AI rationale. The rationale breaks down into a general signal score (notability, reviews, cultural significance) and a personal score (match to your profile and preferences).

**Actions** — From the detail card:
- "Want to Read" adds the book to your wishlist
- "Not interested" dismisses it (dimmed, can be undone)
- "Bookshop.org" opens a purchase link

A toggle at the bottom lets you show or hide dismissed books.

---

## Settings

Access Settings from the sidebar. Here you can manage your account and subscription.

**Password** — Change your password. If you signed up with Google OAuth, this section notes that your password is managed through Google.

**Library Export** — Download your entire library as a CSV file containing titles, authors, ratings, status, notes, and metadata.

**Subscription** — View your current plan and billing period. Paid subscribers can access the Stripe Customer Portal to manage billing. Free users see upgrade options.

**Delete Account** — Permanently delete your account and all associated data. Requires typing a confirmation phrase.

---

## Navigation

Rekollekt's sidebar provides access to all major sections:

| Section | Description |
|---------|-------------|
| **Home** | Personalized dashboard |
| **Library** | Book catalog with search, filters, and gallery tabs |
| **Syllabi** | Curated reading collections and reading paths |
| **Shelves** | Visual bookshelves (manual + auto) |
| **Recommendations** | AI-predicted top picks |
| **New Releases** | Scored upcoming books |
| **Chat** | AI reading companion |
| **Profile** | Reader identity portrait |
| **Settings** | Account, export, and subscription management |
| **Add Book** | Search ISBNdb and add to library |

On mobile, the sidebar is accessible via the menu button and slides in as an overlay.

The floating chat panel is available on every page (except the full chat page) via the bubble button in the bottom-right corner.
