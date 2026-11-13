# Rekollekt Privacy Policy

**DRAFT for legal review. Not yet in effect.** Bracketed items need a decision.

Effective [DATE]

Rekollekt is a personal book library with an AI reading companion. It works by knowing a lot about your reading: what you own, what you thought of it, and what you talk about with the companion. This policy explains what we collect, what we do with it, who else handles it, and what you can do about it.

"Rekollekt", "we", and "us" mean [LEGAL ENTITY NAME], a [STATE] [entity type]. Questions go to [CONTACT EMAIL].

## The short version

- Your library, notes, and conversations are private to your account. Other readers can't see them.
- We send what the AI needs to an AI provider (Anthropic) to answer you and to build your reader profile. Under the terms we use their service on, Anthropic doesn't train its models on it, and neither do we.
- We don't sell your information, and we don't show ads.
- You can export your library and delete your account at any time from Settings.

## What we collect

**Your account.** Your email address and a password, or the name, email address, and profile picture from Google if you sign in with Google. Passwords are handled by our authentication provider and stored only as a secure hash; we never see them.

**Your library.** The books you add, whether by search, Goodreads import, or through the companion, and what you record about them: reading status, dates, ratings, favorites, notes, tags, shelves, syllabi, and reading paths. A Goodreads import is read in your browser; we keep the books from it, not the file.

**Your conversations.** Your messages to the reading companion and its replies, the excerpts saved to your books, short summaries of book conversations, and a record of what the companion changed in your library.

**What the AI learns about you.** The companion keeps short notes about your tastes and reading life ("memory") so it doesn't have to ask again. Rekollekt also writes a reader profile describing your tastes, themes, and reading patterns, predicts how you'd rate unread books, and picks new releases for you. These are generated from your library, memory, and conversations. You can see your profile on the Profile page and ask the companion to change or forget what it remembers.

**Payments.** If you subscribe, payment is handled by Stripe. We never see or store your card number. We keep your plan, its status and renewal date, Stripe's customer reference, and a record of payments, refunds, and fees.

**How you use Rekollekt.** We use PostHog, a product analytics service, to understand which features are used: pages viewed and actions taken (signing up, adding a book, starting a chat, and similar), linked to your account and email address. We also record what each AI request costs, by account, to keep the service affordable and catch abuse.

**Technical information.** Your IP address is used to limit how many requests can be made in a short time, which protects the service from abuse; it's kept in memory, not stored. Our hosting provider's logs may include IP addresses and request details for a limited time. Cloudflare Turnstile checks that sign-ups and sign-ins come from a person, using information about your browser and device.

**Messages to us.** If you use the contact form, we keep your name, email address, and message.

## How we use it

- To run Rekollekt: your library, the companion, your profile, predictions, recommendations, and new release picks.
- To bill subscriptions and keep the free and paid plans working as described.
- To keep the service safe and working: preventing abuse, enforcing usage limits, and fixing problems.
- To improve Rekollekt, using usage patterns rather than reading what you've written.
- To contact you about your account: sign-in and password emails, receipts, and important changes to the service or these policies. We don't send marketing email [unless you opt in].

We don't read your conversations or notes as a matter of course. We may look at your account's data to fix a problem you report, to investigate a suspected violation of our Terms, or where the law requires it.

## How the AI works with your information

When you talk to the companion, we send the AI provider what it needs to reply: your message and the conversation so far, your reader profile, your library (the books you're reading, have read, rated, or marked as favorites, with a summary of the rest), your syllabi and reading paths, and its memory of you. The same kind of information is used to write your profile, predict ratings, pick releases, and write the greeting on your home page.

Our AI provider is Anthropic. We use its commercial API, under terms that don't allow your information to be used to train its models. Anthropic keeps API data only for a limited time, under its own policies, to provide the service and to detect misuse.

To search your library by meaning, we create a numerical representation ("embedding") of each book from public information about it (title, author, genre, and summary) through Voyage AI, which is provided through MongoDB. When the companion searches your library this way, its description of what you're looking for is sent to Voyage too. Nothing else about you is sent.

AI makes mistakes. The companion's replies, your profile, and predictions are its interpretation, not facts about you, and they can be wrong.

## Who else handles your information

We use these service providers to run Rekollekt. Each handles your information only to provide its service to us:

| Provider | What it does | What it receives |
|---|---|---|
| Supabase | Database and sign-in | Everything stored in your account |
| Render | Runs our servers | Requests to our servers, while they're handled |
| Anthropic | AI for the companion, profiles, predictions, and recommendations | What the AI needs for each request (see above) |
| Voyage AI (through MongoDB) | Search by meaning | Public book information, and the companion's search descriptions |
| ISBNdb | Book information and covers | Titles, authors, and ISBNs being looked up |
| Stripe | Payments | Your email address and payment details |
| PostHog | Product analytics | Usage events, your account ID, and email address |
| Cloudflare | Bot protection on sign-up and sign-in | Browser and device signals |
| Google | Sign-in with Google, if you choose it | Your sign-in |
| [Email provider] | Account emails | Your email address |

We also share information if the law requires it, to protect the rights or safety of our readers or others, or as part of a sale or merger of Rekollekt, in which case this policy continues to apply to your information.

We don't sell your personal information or share it for advertising.

Links to buy a book go to Bookshop.org. What happens there is covered by its own policies.

## Where it's stored

Rekollekt and its providers store and process information in the United States. If you use Rekollekt from elsewhere, your information is transferred to and handled in the United States.

## How long we keep it

We keep your information while your account exists. When you delete your account, your library, conversations, memory, profile, and the rest of your account's data are deleted right away, and removed from backups as they expire, within [7] days. We keep records of payments and refunds as long as tax and accounting rules require, without the rest of your account. Analytics data is kept by PostHog for [its retention period]. Contact form messages are kept for [up to two years].

## Your choices and rights

- **See and export.** Your library is always visible to you, and Settings exports it as a CSV file. Ask us for a copy of anything else we hold about you, such as your conversations.
- **Correct.** Edit your library directly, and ask the companion to change what it remembers.
- **Delete.** Delete anything in your library at any time, or your whole account from Settings.
- **Analytics.** [Decide: offer a way to opt out of analytics, or rely on browser blocking.]

Depending on where you live, you may have other rights, such as to object to some uses of your information or to complain to a data protection authority. Contact us at [CONTACT EMAIL] and we'll respond within [30] days.

## Cookies and local storage

Rekollekt stores your sign-in session in your browser so you stay signed in, and remembers a few preferences, such as whether you've seen your latest profile. PostHog uses a cookie and local storage to tell visits apart. Cloudflare Turnstile and Stripe's checkout pages use their own cookies. We don't use advertising cookies.

## Security

Connections to Rekollekt are encrypted. Each reader's data is separated in the database, so one account can't read another's. Passwords are hashed by our sign-in provider. No system is perfectly secure; if a breach affects your information, we'll tell you as the law requires.

## Children

Rekollekt isn't for children under [13] [or 16 in the EEA and UK]. We don't knowingly collect information from them. If you believe a child has an account, tell us and we'll delete it.

## Changes

If we change this policy in a way that matters, we'll tell you by email or in the app before the change takes effect. The date at the top shows when it last changed.

## Contact

[LEGAL ENTITY NAME]
[POSTAL ADDRESS]
[CONTACT EMAIL]
