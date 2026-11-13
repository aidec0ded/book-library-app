import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { COMPANION_ANNUAL_PRICE, COMPANION_MONTHLY_PRICE, COMPANION_MONTHLY_REPLIES, FREE_FIRST_MONTH_DAYS, FREE_FIRST_MONTH_REPLIES, FREE_MONTHLY_REPLIES, FREE_PERIOD_LAST_DAY, FREE_REPLIES_SUMMARY, ONBOARDING_FREE_MESSAGES, inFreePeriod } from "@/lib/plans";

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
      ...(inFreePeriod()
        ? [
            {
              q: "Is Rekollekt free right now?",
              a: `Yes. While we launch, everyone has Companion at no charge through ${FREE_PERIOD_LAST_DAY}: up to ${COMPANION_MONTHLY_REPLIES} replies a month from your reading companion, syllabi and reading paths, and weekly profile refreshes. No card is needed. After that, Rekollekt stays free to use, and Companion is $${COMPANION_MONTHLY_PRICE} a month or $${COMPANION_ANNUAL_PRICE} a year if you want to keep it. If you subscribe before then, you won't be charged until the free period ends. Syllabi and reading paths you make stay yours either way.`,
            },
          ]
        : []),
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
        a: `Your whole library with shelves, notes, and reading dates; Goodreads import; tags and predicted ratings for every book; a reader profile, with a new one each month you're reading; personalized recommendations and new release picks; saving anything from a conversation to a book's page; and ${FREE_REPLIES_SUMMARY}, from your reading companion.`,
      },
      {
        q: "How many replies do I get for free?",
        a: `${FREE_FIRST_MONTH_REPLIES} a month for your first ${FREE_FIRST_MONTH_DAYS} days, so you can get to know your reading companion, then ${FREE_MONTHLY_REPLIES} a month. Each message you send gets one reply, and each reply counts once. The count resets on the 1st of each month, and the first ${ONBOARDING_FREE_MESSAGES} messages while you set up your library don't count.`,
      },
      {
        q: "How do predicted ratings work?",
        a: "The AI analyzes your library, ratings, and reader profile to estimate how much you'd enjoy books you haven't read yet. Predictions appear on unread books in your library.",
      },
      {
        q: "How does my reader profile get generated?",
        a: "Once you've added enough books and ratings, the AI writes a profile of your reading taste: your themes, emotional patterns, and how your taste is changing. After that, when you've been reading, a new one is ready about once a month. You'll see a note in the app, and it's written when you click. On Companion you can also refresh it weekly. A new monthly profile also updates your predicted ratings.",
      },
      {
        q: "Tips for making the most of your free replies?",
        a: "Be specific: ask about a book you just finished, request recommendations with context about your mood, or ask about patterns in your reading. Each message is more valuable when it's focused.",
      },
    ],
  },
  {
    heading: "Paid Tier",
    items: [
      {
        q: "What do I get with a subscription?",
        a: `Everything in the free plan, plus up to ${COMPANION_MONTHLY_REPLIES} replies a month from your reading companion, syllabi and reading paths built with it, insights from book conversations saved to book pages for you, and weekly profile refreshes.`,
      },
      {
        q: `Why is Companion limited to ${COMPANION_MONTHLY_REPLIES} replies a month?`,
        a: `Every reply is written by an AI model, which costs us real money each time. ${COMPANION_MONTHLY_REPLIES} a month is room for several long conversations a week, and the limit keeps the price fair for everyone. It resets on the 1st.`,
      },
      {
        q: "What are reading paths and syllabi?",
        a: "Syllabi are themed reading lists curated through conversation with the AI. Reading paths go deeper — structured intellectual journeys with a thesis, pre-reading context, focus questions, and post-reading discussion prompts for each book.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes, from Settings. You keep Companion until the end of the period you've paid for, and you won't be charged again. We don't refund partial periods. If a payment fails, you keep Companion while we retry your card, and Settings shows how to update it.",
      },
      {
        q: "What happens to my data if I cancel?",
        a: `Your library, ratings, profile, and everything else stay as they are. You go back to ${FREE_MONTHLY_REPLIES} replies a month. Your syllabi and reading paths stay too: you can open them and talk about them with the companion, but not create new ones or change them.`,
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
