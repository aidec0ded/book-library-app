# Rekollekt Launch Plan

## Core Positioning

Rekollekt exists because reading apps have drifted toward social performance and gamification — read counts, public ratings, annual challenges — at the expense of actually reading meaningfully. The sharpest positioning is what Rekollekt is *against*: the ecosystem that rewards reading *more* rather than reading *well*.

**One-line pitch:** An AI reading companion that helps you understand what books do to you — not count how many you've read.

**The philosophy:** Intentional reading over performative reading. The app's central loop is read, reflect, deepen — not read, rate, share. This should drive every decision about who we target and how we reach them.

**What Rekollekt is:**
- A personal reading companion that learns your taste through conversation
- A tool for readers who think about books beyond "I liked it"
- A private space to build and explore your own library
- An AI that gets smarter about *you* the more you engage

**What Rekollekt is not:**
- A social network (no feeds, no followers, no public profiles)
- A reading tracker (no challenges, no annual goals, no streaks)
- A review platform (your reflections are for you, not an audience)
- A bookstore or marketplace

---

## Phase 1: Alpha (Now — 4-6 weeks)

### Goals

Validate the core loop: does read → reflect via chat → AI understanding deepens → better recommendations actually work? Get signal on whether people come back to chat, whether the reader profile feels accurate, and what's broken or confusing.

### Who to Recruit (10-15 people)

Hand-pick from your personal network. You want readers who:

- **Read regularly but don't obsess over count** — they care about what books do to them
- **Have opinions beyond surface reactions** — they can articulate why a book worked or didn't
- **Will actually use the chat** — the reflection loop is the product; passive library managers won't test it
- **Will give honest, specific feedback** — not people doing you a favor who'll say "looks great"

Avoid filling alpha with casual readers. You need people who will *want* this to exist.

### Operations

- Grant all alpha users complimentary paid subscriptions via `grant-subscription.ts`
- Create a direct feedback channel — group iMessage/Signal thread or short 1:1 calls after their first week
- Don't build a feedback form; you want conversation, not surveys
- Track: chat engagement (conversations started, messages sent), profile accuracy feedback, feature usage, retention (do they come back after week 1?)

### What You're Learning

1. Does the onboarding work? (Import → chat → library populated → profile generated)
2. Does the AI chat feel like talking to a well-read friend, or a bot?
3. Does the reader profile feel accurate after a few conversations?
4. What features do people actually use vs. ignore?
5. What's confusing or broken?
6. Is there a moment where the app "clicks" — and what triggers it?

---

## Phase 2: Beta (6-12 weeks out)

### Goals

Test onboarding friction at scale, measure retention and conversion, and find product-market fit signal. The key question: do strangers (not friends) come back after week 1?

### Who to Recruit (50-200 people)

Source from communities where Rekollekt's values already resonate:

**High-priority audiences:**

- **Literary fiction readers and rereaders** — r/literature, r/TrueLit, literary Twitter/Threads. These readers already think about books the way Rekollekt does. They're underserved by Goodreads.
- **Book club organizers** — people who facilitate discussion, not just pick the next book. The seminar-style reading paths map directly to how they think. Find them in local bookstore communities, Meetup groups, and book club subreddits.
- **Annotators and reading journalers** — the "marginalia people" on Bookstagram who photograph their notes and underlines. They're already doing the reflection Rekollekt automates. The AI conversation is the natural evolution of their practice.
- **The "post-Goodreads" crowd** — there's a recurring sentiment across book communities: "I wish there was something better than Goodreads." These people are actively looking for what you're building. They surface in Reddit threads, Threads posts, and blog comments.

**Who to avoid:**

- **High-volume BookTok creators** focused on hauls and monthly wrap-ups. They have reach but their audience optimizes for volume, not depth. Signups from this crowd will churn because the app doesn't reward reading speed.
- **Reading challenge completers** — people whose identity is "I read 100 books this year." Rekollekt has no challenges, no streaks, no badges. They'll feel the absence.
- **People who primarily want social features** — shared shelves, friend activity, public reviews. Rekollekt is deliberately private. They'll be frustrated, not delighted.

### Recruitment Channels

1. **Reddit** — Post in r/books, r/suggestmeabook, r/literature. Don't promote the app directly. Post the *idea*: "Does anyone else feel like tracking books has become more about the count than the experience?" Let people find Rekollekt through your profile and comment engagement.
2. **Threads / Literary Twitter** — Share the philosophy, link to the app in bio. The "Goodreads is broken" take travels well here.
3. **Bookstagram** — DM annotators and journalers whose practice aligns with Rekollekt's values. Offer early access.
4. **Substack / book newsletters** — Pitch guest posts or interviews about intentional reading to newsletters with aligned audiences.

### What You're Learning

1. **Onboarding completion rate** — do people import and start chatting, or drop off?
2. **Week 1 retention** — do they come back after the first session?
3. **Chat engagement depth** — messages per conversation, conversations per week
4. **Conversion signal** — does the free tier (5 messages/month) create enough value that people hit the limit and want more?
5. **Feature adoption** — which features drive engagement (chat, shelves, reading paths, releases) vs. sit unused?
6. **Organic sharing** — do users tell other readers about it without being asked?

---

## Phase 3: Organic Growth

### Strategy

The growth strategy is organic-first, following the Gary Vaynerchuk playbook: create valuable content that embodies Rekollekt's philosophy, distribute it natively across platforms, and engage authentically. The key insight is that **you're not selling an app — you're selling a philosophy about reading.** People should encounter the idea, agree with it, and then discover Rekollekt as the tool that delivers on it.

### Content Pillars

**1. "Reading apps are broken"**
The hook that gets attention. Why Goodreads incentivizes the wrong things. Why read counts don't measure anything meaningful. Why public ratings flatten nuance. This is contrarian and opinionated — exactly what performs well organically.

Example angles:
- "Goodreads rewards you for finishing books. Nobody rewards you for understanding them."
- "Your rating of a book at 2am the night you finish it is not the same as your understanding of it a month later."
- "The reading challenge industrial complex: how '52 books a year' became a personality trait."

**2. "What books actually do to you"**
Share the kind of insights Rekollekt's AI surfaces — without making it a product demo. This demonstrates the app's value through the *output*, not the interface.

Example angles:
- "I didn't realize every novel I loved in 2025 was about characters choosing isolation over connection."
- "The difference between a 4-star book and a book that changes how you think."
- "Why the book you reread says more about you than the book you just finished."

**3. "How to read more intentionally"**
Practical, valuable content that aligns with the app's philosophy. Not "how to read 100 books a year" — the opposite.

Example angles:
- "Why rereading a book is more valuable than reading a new one."
- "The case for reading fewer books, more slowly."
- "How to choose your next book based on what you need, not what's trending."

### Platform Strategy (Priority Order)

**1. Threads / Literary Twitter**
- Fastest feedback loop, text-native, where the opinionated book conversation already lives
- The "Goodreads is broken" take will travel here
- Engage in existing conversations; don't just broadcast
- Post 3-5x/week; mix philosophy takes, reading observations, and genuine engagement with other readers

**2. Reddit**
- r/books (6M+), r/suggestmeabook (3M+), r/literature, r/TrueLit
- Never post about Rekollekt directly — give value first
- Post the ideas behind it, answer questions, share reading philosophy
- Let people discover the app through your profile and comment history
- This is the slowest channel but the highest-trust one

**3. Bookstagram**
- The annotator/journaler audience lives here
- Visual content: reader profile screenshots, reading path layouts, AI conversation snippets
- This audience is already doing the manual version of what Rekollekt automates
- Collaborate with micro-creators (1K-10K followers) who align with the philosophy

**4. Substack / Medium / Personal Blog**
- Longer-form essays expanding the reading philosophy
- The `/philosophy` page content is already a starting point — repurpose and expand
- Guest posts on book-focused newsletters
- SEO value compounds over time — "best Goodreads alternatives," "intentional reading app," etc.

**5. BookTok (Lower Priority)**
- The "anti-reading-challenge" angle could work as short-form video
- "I stopped tracking how many books I read and started tracking what they did to me"
- Lower priority because the audience skews toward volume-focused readers
- But the contrarian take can find its niche here

### What NOT to Do (Yet)

- **Paid ads** — premature; you don't know CAC or LTV yet. Organic signal first.
- **Product Hunt launch** — one-day spike with no retention signal. Save for a moment when you have social proof and retention data.
- **Influencer partnerships** — too early and too expensive. Organic alignment beats paid promotion at this stage.
- **Press/media outreach** — save for when you have a story to tell (user growth, a compelling data insight, a milestone).

---

## The Growth Flywheel

The organic flywheel, once it's spinning:

1. **Opinionated content** about reading intentionally
2. **Resonance** with like-minded readers who feel the same frustration
3. **They try the app** — the philosophy drew them in, the product has to deliver
4. **The app delivers** — the AI chat feels genuinely useful, the reader profile is accurate, the recommendations hit
5. **They tell other readers** — not because you asked, but because they found something that finally works

The flywheel only works if step 4 is true. That's what alpha and beta validate. Don't scale distribution until you're confident the product delivers on the promise.

---

## Success Metrics by Phase

### Alpha
- 10+ active users (at least 3 chat sessions each)
- Qualitative: "this gets me" feedback on reader profile accuracy
- Identify top 3 friction points and fix them

### Beta
- 100+ signups, 30%+ complete onboarding
- Week 1 retention > 40%
- At least 5% of free users hit the message limit (conversion signal)
- Net Promoter Score or qualitative equivalent: would you recommend this?

### Growth
- Consistent organic signups without paid spend
- Conversion rate from free → paid stabilizes (target: 5-10%)
- Monthly recurring revenue covers infrastructure costs
- Users creating content about Rekollekt without being asked

---

## Timeline

| Phase | Duration | Focus |
|-------|----------|-------|
| Alpha | Weeks 1-6 | Core loop validation, bug fixing, 10-15 hand-picked users |
| Alpha → Beta bridge | Weeks 4-6 | Fix what alpha surfaced, polish onboarding |
| Beta | Weeks 6-14 | Scale to 50-200, measure retention + conversion |
| Organic growth | Week 10+ | Begin content creation, start with 1-2 platforms |
| Evaluate | Week 14+ | Do we have product-market fit? Decide on paid acquisition |
