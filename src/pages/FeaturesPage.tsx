import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef, useState } from "react";

const FEATURES = [
  {
    num: "01",
    label: "Collection",
    title: "Your Library",
    description:
      "Your complete book collection — fiction, nonfiction, and poetry — each understood on its own terms. Search instantly, browse by mood and classification, and add any book from a database of millions.",
    bullets: [
      "Fiction vibes, nonfiction topics, poetry movements — each type gets its own vocabulary",
      "AI-assigned classification tags with human confirmation",
      "Cover images, literary awards, and rich metadata",
      "Add books by title, author, or ISBN from ISBNdb's comprehensive database",
    ],
    caption: "Your Library",
  },
  {
    num: "02",
    label: "Conversation",
    title: "AI Reading Companion",
    description:
      "A knowledgeable, empathetic reading partner that deepens your relationship with books through conversation. Discuss what you're reading, explore connections between books, and let the AI take actions on your behalf.",
    bullets: [
      "Streaming conversation with full history and auto-generated titles",
      "Accessible from every page via floating panel or dedicated chat view",
      "Manages your wishlist, creates syllabi, saves insights, and updates your library",
      "Persistent memory that builds understanding across every conversation",
    ],
    caption: "AI Reading Companion",
  },
  {
    num: "03",
    label: "Intelligence",
    title: "Understanding You",
    description:
      "The more you read and reflect, the more Rekollekt learns. A monthly AI-generated reader profile captures who you are as a reader — your thematic pillars, emotional patterns, taste evolution, and personal canon.",
    bullets: [
      "Predicted ratings help prioritize your unread books",
      "Personalized recommendations grounded in your actual reading patterns",
      "Fiction taste, nonfiction interests, and poetry affinities each tracked separately",
      "Activity-gated regeneration ensures the profile stays current",
    ],
    caption: "Understanding You",
  },
  {
    num: "04",
    label: "Exploration",
    title: "Discovery",
    description:
      "Find your next book through AI-scored new releases, curated syllabi, and literary award history. Every recommendation is personal — scored against your profile, not popularity charts.",
    bullets: [
      "New releases scored for personal relevance and general cultural signal",
      "Curated syllabi with rationale for every book selection",
      "17 literary awards tracked — winner, shortlist, longlist, nominee",
      "Wishlist integration and Bookshop.org purchase links",
    ],
    caption: "Discovery",
  },
  {
    num: "05",
    label: "Atmosphere",
    title: "Your Space",
    description:
      "Your library should feel like a room you want to spend time in. Build visual shelves — manual collections or auto-populated by your rules — and browse them in an immersive coverflow carousel.",
    bullets: [
      "Manual shelves with drag-to-reorder",
      "Auto shelves that populate from filters — genre, rating, vibes, status, and more",
      "Full-screen coverflow carousel for immersive browsing",
      "A personalized home page with context-aware greeting, currently reading, and reading DNA stats",
    ],
    caption: "Your Space",
  },
];

export function FeaturesPage() {
  const { session } = useAuth();
  const entryLink = session ? "/home" : "/login";
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sectionRefs.current.forEach((el, i) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveIndex(i);
        },
        { rootMargin: "-40% 0px -40% 0px" }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

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
            className="text-base font-semibold text-foreground transition-colors"
          >
            Features
          </Link>
          <a
            href="#"
            className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Contact
          </a>
        </div>
        <Link
          to={entryLink}
          className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-all hover:opacity-90"
        >
          {session ? "Go to library" : "Get started"}
        </Link>
      </nav>

      {/* Header */}
      <header className="mx-auto max-w-4xl px-6 pt-16 pb-12 text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-foreground/20" />
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Features
          </span>
          <span className="h-px w-8 bg-foreground/20" />
        </div>
        <h1 className="font-serif text-5xl font-normal leading-[1.1] tracking-tight md:text-7xl">
          What's{" "}
          <span className="italic text-muted-foreground">inside</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Everything you need to build a personal, reflective relationship with
          your library.
        </p>
      </header>

      {/* Sticky scroll feature sections */}
      <div className="mx-auto max-w-7xl px-6 pb-24">
        <div className="lg:grid lg:grid-cols-12 lg:gap-16">
          {/* Left column — scrollable text */}
          <div className="lg:col-span-5 lg:py-[10vh]">
            {FEATURES.map((feature, i) => (
              <section
                key={feature.num}
                ref={(el) => { sectionRefs.current[i] = el; }}
                className="flex min-h-[70vh] flex-col justify-center py-12"
              >
                <div className="mb-6 flex items-baseline gap-4">
                  <span className="text-sm font-bold tracking-widest text-accent">
                    {feature.num}
                  </span>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {feature.label}
                  </span>
                </div>
                <h2 className="mb-6 font-serif text-4xl md:text-5xl">
                  {feature.title}
                </h2>
                <p className="mb-8 text-lg leading-relaxed text-foreground/80">
                  {feature.description}
                </p>
                <ul className="space-y-3">
                  {feature.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex gap-3 text-[0.95rem] leading-relaxed text-muted-foreground"
                    >
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Right column — sticky visual */}
          <div className="hidden lg:col-span-7 lg:flex lg:items-start lg:pl-8">
            <div className="sticky top-[10vh] h-[80vh] w-full flex flex-col justify-center">
              {/* Image frame */}
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                {/* Placeholder content */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full border border-border bg-secondary flex items-center justify-center">
                      <span className="font-serif text-2xl text-muted-foreground">
                        {FEATURES[activeIndex].num}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Screenshot coming soon
                    </p>
                  </div>
                </div>
              </div>

              {/* Caption */}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
                <span className="italic">
                  Fig {FEATURES[activeIndex].num} —{" "}
                  {FEATURES[activeIndex].caption}
                </span>
                <div className="flex gap-1.5">
                  {FEATURES.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                        i === activeIndex ? "bg-accent" : "bg-border"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-card py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 font-serif text-4xl font-normal md:text-5xl">
            Enrich your reading life
          </h2>
          <p className="mb-10 text-lg text-muted-foreground">
            Your library is waiting.
          </p>
          <Link
            to={entryLink}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-all hover:opacity-90"
          >
            {session ? "Go to library" : "Get started"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 md:px-12 lg:px-24">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Rekollekt</span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
