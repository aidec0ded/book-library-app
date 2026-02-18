import { useState, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

function SectionNav({ sections, activeId, onSelect }: {
  sections: Section[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="space-y-0.5">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
            activeId === s.id
              ? "bg-accent/10 font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${activeId === s.id ? "rotate-90" : ""}`} />
          {s.title}
        </button>
      ))}
    </nav>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-3 font-serif text-xl font-bold first:mt-0">{children}</h3>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h4 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{children}</h4>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 leading-relaxed text-foreground/80">{children}</p>;
}

function Bold({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[0.95rem] leading-relaxed text-foreground/80">
      <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}

function Prompt({ prompt, description }: { prompt: string; description: string }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="font-medium text-foreground">"{prompt}"</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: (
      <>
        <Heading>Getting Started</Heading>
        <P>
          Rekollekt requires an account. Sign up with your email and password, or use Google OAuth.
          Once signed in, you'll be guided through a short onboarding flow.
        </P>

        <Sub>Onboarding</Sub>
        <P>New accounts start with a two-step setup:</P>
        <ol className="mb-4 list-inside list-decimal space-y-2 text-foreground/80">
          <li>
            <Bold>Welcome gate</Bold> — Choose how to begin: import your Goodreads library,
            jump into a conversation with the AI, or skip setup entirely.
          </li>
          <li>
            <Bold>Onboarding chat</Bold> — The AI reading companion helps populate your library
            through natural conversation. It asks about books you love, adds them as you mention
            them, and starts learning your taste. Messages during onboarding are free.
          </li>
        </ol>
        <P>You can click "Start exploring" at any time to finish setup and enter the app.</P>

        <Sub>Importing from Goodreads</Sub>
        <ol className="mb-4 list-inside list-decimal space-y-2 text-foreground/80">
          <li>Export from Goodreads: My Books &gt; Import and export &gt; Export Library</li>
          <li>Upload the CSV file in Rekollekt</li>
          <li>Select which shelves to import (read, currently-reading, to-read, custom shelves)</li>
          <li>For "to-read" books, choose whether to import as Unread or Wishlist</li>
          <li>Duplicates are detected by ISBN and title+author and skipped automatically</li>
        </ol>

        <Sub>Free and Paid Plans</Sub>
        <P>
          <Bold>Free</Bold> — Full library management, shelves, Goodreads import, predicted ratings,
          monthly reader profile, recommendations, new releases, and 5 AI chat messages per month.
        </P>
        <P>
          <Bold>Reading Companion</Bold> ($7/month or $60/year) — Everything in Free, plus unlimited
          chat, AI-created syllabi and reading paths, saved conversation excerpts, and on-demand
          profile regeneration.
        </P>
      </>
    ),
  },
  {
    id: "home",
    title: "Home",
    content: (
      <>
        <Heading>Home</Heading>
        <P>The home page is your personalized landing space. It adapts to the time of day and what you're reading.</P>
        <ul className="mb-4 space-y-2">
          <Li><Bold>Currently Reading</Bold> — If you have books marked as "reading," the hero section showcases the current one. A "Dive Deeper" button opens a conversation about it.</Li>
          <Li><Bold>Personalized Greeting</Bold> — A brief, AI-generated greeting reflecting your current reading activity.</Li>
          <Li><Bold>Picked for You</Bold> — Up to five AI-recommended books from your library, each showing its predicted rating.</Li>
          <Li><Bold>Recently Added</Bold> — The latest books you've added, displayed as cover thumbnails.</Li>
          <Li><Bold>Your Reading DNA</Bold> — Stats: read completion donut chart, top author, most common vibe, and total book count.</Li>
        </ul>
      </>
    ),
  },
  {
    id: "library",
    title: "Library",
    content: (
      <>
        <Heading>Library</Heading>
        <P>The library is the heart of Rekollekt — a searchable, filterable view of your entire book collection.</P>

        <Sub>Search and Filters</Sub>
        <P>
          Type in the search bar to filter by title or author. Toggle "Advanced" for separate title and author fields.
          Expand the filter bar to narrow by status, rating (user or AI-predicted), genre, page count, and publication year.
          Active filters show as a summary line below the bar.
        </P>

        <Sub>Gallery Tabs</Sub>
        <P>
          Three tabs — <Bold>Fiction</Bold>, <Bold>Nonfiction</Bold>, and <Bold>Poetry</Bold> — provide visual gallery views organized by each type's classification system.
          Fiction shows 17 canonical vibes. Nonfiction shows topics, form, and depth. Poetry shows movement, formal feel, and accessibility.
        </P>

        <Sub>Shelves</Sub>
        <P>
          <Bold>Manual shelves</Bold> — Create a shelf, name it, and add books. <Bold>Auto shelves</Bold> — Define filter rules and the shelf populates automatically.
          Click into any shelf for an immersive full-screen coverflow carousel with metadata panel.
        </P>
      </>
    ),
  },
  {
    id: "book-detail",
    title: "Book Detail",
    content: (
      <>
        <Heading>Book Detail</Heading>
        <P>Every book has a detail page with full metadata and inline editing.</P>
        <ul className="mb-4 space-y-2">
          <Li><Bold>Status</Bold> — unread, reading, read, unfinished, or wishlist</Li>
          <Li><Bold>Rating</Bold> — 0.5 to 5 stars</Li>
          <Li><Bold>Favorite</Bold> — toggle the flag</Li>
          <Li><Bold>Cover, ISBN, Notes</Bold> — all editable inline</Li>
        </ul>
        <P>
          AI features include <Bold>predicted ratings</Bold> with rationale for unread books,
          saved <Bold>conversation excerpts</Bold>, and a "Discuss this book" button that opens a focused chat.
        </P>
        <P>
          Additional info: synopsis, classification tags (with editor), literary awards, metadata, and Bookshop.org purchase links for wishlist books.
        </P>
      </>
    ),
  },
  {
    id: "adding-books",
    title: "Adding Books",
    content: (
      <>
        <Heading>Adding Books</Heading>
        <P>
          Navigate to "Add Book" from the sidebar. Search by title, author, or ISBN — results are grouped by edition.
          Click a result to preview its full details. Rekollekt auto-detects book type (fiction, nonfiction, or poetry) from subjects.
        </P>
        <P>
          Choose a reading status and add. Duplicates are caught by ISBN match. Use "Wishlist" for books you want to read but don't own yet.
        </P>
      </>
    ),
  },
  {
    id: "syllabi",
    title: "Syllabi",
    content: (
      <>
        <Heading>Syllabi</Heading>
        <P>
          Curated editorial reading collections — themed course reading lists. Each item can have a <Bold>rationale</Bold> explaining
          why it belongs, and syllabi can include books not in your library.
        </P>
        <P>
          Create them manually or ask the AI companion. The search modal searches both your library and ISBNdb simultaneously.
          External items appear with an amber badge and Bookshop.org link. Reorder with up/down arrows; edit titles and descriptions inline.
        </P>
      </>
    ),
  },
  {
    id: "reading-paths",
    title: "Reading Paths",
    content: (
      <>
        <Heading>Reading Paths</Heading>
        <P>
          Structured intellectual journeys with seminar-style scaffolding. Created exclusively through the AI companion —
          ask it to build a path around a topic, movement, or theme.
        </P>
        <P>
          Each path has a <Bold>thesis</Bold>, and each book includes pre-reading context, focus questions, and post-reading prompts.
          Click progress badges to cycle through not_started, reading, and completed. External items auto-link when you later add the book to your library.
        </P>
      </>
    ),
  },
  {
    id: "chat",
    title: "AI Reading Companion",
    content: (
      <>
        <Heading>AI Reading Companion</Heading>
        <P>
          A knowledgeable reading partner powered by Claude — not a search engine.
          Access it from the sidebar, the floating panel on any page, or the "Discuss this book" button on book details.
        </P>

        <Sub>What It Can Do</Sub>
        <ul className="mb-4 space-y-2">
          <Li><Bold>Discuss books</Bold> — Approaches fiction, nonfiction, and poetry differently</Li>
          <Li><Bold>Manage your library</Bold> — Update status, ratings, favorites; add and remove books</Li>
          <Li><Bold>Create syllabi</Bold> — Themed reading lists with rationale for each selection</Li>
          <Li><Bold>Build reading paths</Bold> — Structured journeys with seminar content</Li>
          <Li><Bold>Manage wishlist</Bold> — Add books you want to read</Li>
          <Li><Bold>Save insights</Bold> — Polished excerpts to book detail pages</Li>
          <Li><Bold>Browse releases</Bold> — Search upcoming books scored against your profile</Li>
          <Li><Bold>Remember you</Bold> — Persistent memory across conversations</Li>
        </ul>

        <Sub>Conversation Starters</Sub>
        <div className="mb-4 space-y-3">
          <Prompt
            prompt="I just finished [book] and I'm not sure what to read next."
            description="Connects what worked about that book to patterns in your library and suggests what to pick up based on your mood."
          />
          <Prompt
            prompt="What connections do you see between my favorite books?"
            description="Surfaces thematic threads across your library — recurring obsessions, emotional patterns, aesthetic preferences."
          />
          <Prompt
            prompt="Build me a reading path around [theme or movement]."
            description="Designs a structured intellectual journey with sequenced books, pre-reading context, and focus questions."
          />
          <Prompt
            prompt="I've been thinking about [idea from a book] — what else touches on that?"
            description="Draws cross-library connections, linking fiction to nonfiction to poetry when relevant."
          />
          <Prompt
            prompt="What's coming out this month that I might like?"
            description="Searches new releases scored against your profile and explains why specific books match your taste."
          />
        </div>

        <Sub>Free Tier</Sub>
        <P>
          Free accounts get 5 messages per month. The counter resets monthly and is visible in the chat interface. Onboarding messages don't count.
        </P>
      </>
    ),
  },
  {
    id: "profile",
    title: "Reader Profile",
    content: (
      <>
        <Heading>Reader Profile</Heading>
        <P>An AI-generated portrait of who you are as a reader, displayed as a full-screen snap-scrolling slide deck.</P>
        <ul className="mb-4 space-y-2">
          <Li><Bold>Reader Identity</Bold> — Narrative description of your reading personality</Li>
          <Li><Bold>Thematic Pillars</Bold> — Core themes with example books</Li>
          <Li><Bold>Taste Evolution</Bold> — Current shifts and consistent throughlines</Li>
          <Li><Bold>Emotional Patterns</Bold> — How you engage emotionally with books</Li>
          <Li><Bold>Beyond Fiction</Bold> — Nonfiction identity and poetry sensibility (if applicable)</Li>
          <Li><Bold>Personal Canon</Bold> — Editable list of books that define you as a reader</Li>
          <Li><Bold>Reading Life</Bold> — Statistical snapshot</Li>
        </ul>
        <P>Regenerates roughly monthly when meaningful new activity is detected.</P>
      </>
    ),
  },
  {
    id: "recommendations",
    title: "Recommendations",
    content: (
      <>
        <Heading>Recommendations</Heading>
        <P>
          Up to 20 unread or wishlisted books ranked by AI-predicted rating.
          Predictions use your reader profile, rating history, and classification data, calibrated by book type.
        </P>
      </>
    ),
  },
  {
    id: "releases",
    title: "New Releases",
    content: (
      <>
        <Heading>New Releases</Heading>
        <P>
          Discover upcoming books scored for personal relevance. Toggle between "Recommended" (by AI score) and "All" (alphabetical).
          Filter by Fiction or Nonfiction.
        </P>
        <P>
          Score badges: amber (8+), green (6+), neutral (4+). Click any book for an inline detail card with synopsis, subjects,
          and AI rationale broken into general signal and personal match scores.
        </P>
        <P>
          Actions: "Want to Read" (wishlist), "Not interested" (dismiss), and Bookshop.org links.
        </P>
      </>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    content: (
      <>
        <Heading>Settings</Heading>
        <ul className="mb-4 space-y-2">
          <Li><Bold>Password</Bold> — Change your password (Google OAuth users see a note that password is managed through Google)</Li>
          <Li><Bold>Library Export</Bold> — Download your library as a CSV</Li>
          <Li><Bold>Subscription</Bold> — View plan and billing. Paid users access the Stripe Customer Portal. Free users see upgrade options.</Li>
          <Li><Bold>Delete Account</Bold> — Permanently remove your account and all data (requires confirmation phrase)</Li>
        </ul>
      </>
    ),
  },
];

export function GuidePage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Track active section on scroll
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sectionRefs.current.forEach((el, id) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(id);
        },
        { rootMargin: "-20% 0px -60% 0px" },
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  function scrollToSection(id: string) {
    setActiveId(id);
    const el = document.getElementById(`guide-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10">
        <h1 className="font-serif text-3xl font-bold tracking-tight">User Guide</h1>
        <p className="mt-2 text-muted-foreground">
          Everything you can do in Rekollekt.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:gap-12">
        {/* Sticky sidebar nav */}
        <div className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-8">
            <SectionNav sections={SECTIONS} activeId={activeId} onSelect={scrollToSection} />
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-9">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={`guide-${section.id}`}
              ref={(el) => { if (el) sectionRefs.current.set(section.id, el); }}
              className="mb-12 scroll-mt-8 border-b border-border pb-12 last:border-0"
            >
              {section.content}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GuidePage;
