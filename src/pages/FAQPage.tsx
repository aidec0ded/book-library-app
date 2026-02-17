import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  q: string;
  a: string;
}

interface FAQSection {
  heading: string;
  items: FAQItem[];
}

const SECTIONS: FAQSection[] = [
  {
    heading: "General",
    items: [
      {
        q: "What is Rekollekt?",
        a: "Rekollekt is a personal book library app with an AI reading companion. It helps you track your reading, understand your taste, and discover what to read next — through conversation, not algorithms.",
      },
      {
        q: "How is it different from Goodreads or StoryGraph?",
        a: "Most book apps focus on social features and reading stats. Rekollekt focuses on the reader's inner life — how books affect you, how your taste evolves, and what that means for what to read next. The AI companion is a genuine conversational partner, not a recommendation engine.",
      },
      {
        q: "Is my data private?",
        a: "Yes. Your library, conversations, and profile are private to your account. We don't share your data with other users or third parties. AI conversations are processed through a secure API and your data is never used for model training.",
      },
    ],
  },
  {
    heading: "Free Tier",
    items: [
      {
        q: "What do I get for free?",
        a: "Full library management, visual shelves, Goodreads import, AI-predicted ratings, a monthly reader profile, personalized recommendations, new releases scored for you, and 5 AI chat messages per month.",
      },
      {
        q: 'What does "5 chat messages per month" mean?',
        a: "Each message you send to the AI counts as one. The assistant's responses don't count toward your limit. Your counter resets on the 1st of each month.",
      },
      {
        q: "How do predicted ratings work?",
        a: "The AI analyzes your library, ratings, and reader profile to estimate how much you'd enjoy books you haven't read yet. Predictions appear on unread books in your library.",
      },
      {
        q: "How does my reader profile get generated?",
        a: "After you've added enough books and ratings, the AI builds a profile of your reading taste — your thematic interests, emotional patterns, and evolving sensibility. It regenerates monthly as your library evolves.",
      },
      {
        q: "Tips for making the most of 5 free messages?",
        a: "Be specific: ask about a book you just finished, request recommendations with context about your mood, or ask about patterns in your reading. Each message is more valuable when it's focused.",
      },
    ],
  },
  {
    heading: "Paid Tier",
    items: [
      {
        q: "What do I get with a subscription?",
        a: "Everything in the free tier, plus unlimited AI chat, curated syllabi, structured reading paths with seminar-style scaffolding, conversation excerpts saved to book pages, and on-demand profile regeneration.",
      },
      {
        q: "What are reading paths and syllabi?",
        a: "Syllabi are themed reading lists curated through conversation with the AI. Reading paths go deeper — structured intellectual journeys with a thesis, pre-reading context, focus questions, and post-reading discussion prompts for each book.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Your subscription remains active through the end of your current billing period. No refunds for partial periods, but you keep full access until the period ends.",
      },
      {
        q: "What happens to my data if I cancel?",
        a: "Your library, ratings, profile, and all your data stay intact. You lose access to unlimited chat, creating new syllabi and reading paths, but can still view existing ones read-only.",
      },
    ],
  },
  {
    heading: "Data & Privacy",
    items: [
      {
        q: "Can I export my data?",
        a: "CSV export is available from Settings. You can export your full library with all metadata at any time.",
      },
      {
        q: "How do I delete my account?",
        a: "Settings → Delete Account. All your data is permanently removed. This action cannot be undone.",
      },
    ],
  },
];

function Accordion({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-foreground/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="pr-4 text-base font-medium">{item.q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ${
          open ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FAQPage() {
  const { session } = useAuth();
  const entryLink = session ? "/home" : "/login";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="flex w-full items-center justify-between px-6 py-8 md:px-12 lg:px-24">
        <Link to="/" className="font-serif text-2xl font-bold tracking-tight">
          Rekollekt
        </Link>
        <div className="hidden items-center gap-10 sm:flex">
          <Link
            to="/philosophy"
            className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Philosophy
          </Link>
          <Link
            to="/features"
            className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </Link>
          <Link
            to="/pricing"
            className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            to="/faq"
            className="text-base font-semibold text-foreground transition-colors"
          >
            FAQ
          </Link>
          <Link
            to="/contact"
            className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Contact
          </Link>
        </div>
        <Link
          to={entryLink}
          className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-all hover:opacity-90"
        >
          {session ? "Go to library" : "Get started"}
        </Link>
      </nav>

      {/* Content */}
      <section className="px-6 pb-24 pt-12 md:px-12 lg:px-24">
        <div className="mx-auto max-w-2xl">
          <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
            FAQ
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Common questions about Rekollekt.
          </p>

          <div className="mt-16 space-y-12">
            {SECTIONS.map((section) => (
              <div key={section.heading}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {section.heading}
                </h2>
                <div>
                  {section.items.map((item) => (
                    <Accordion key={item.q} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
