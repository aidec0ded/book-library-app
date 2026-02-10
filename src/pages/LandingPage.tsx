import { Link } from "react-router-dom";
import {
  MessageCircle,
  BarChart3,
  GraduationCap,
  Layers,
  Sparkles,
  Newspaper,
  ArrowRight,
} from "lucide-react";

const VALUE_PROPS = [
  {
    icon: MessageCircle,
    title: "Reflect",
    description:
      "An AI reading companion for the conversations you wish you could have about every book. Discuss themes, connections, and what lingered after the last page.",
  },
  {
    icon: Sparkles,
    title: "Understand",
    description:
      "A reader profile that evolves with you. Not a list of ratings\u2009\u2014\u2009a portrait of your literary identity, your emotional patterns, and taste evolution.",
  },
  {
    icon: BarChart3,
    title: "Discover",
    description:
      "Recommendations grounded in who you actually are as a reader. Predicted ratings, curated syllabi, new releases scored to your taste.",
  },
];

const FEATURES = [
  {
    icon: MessageCircle,
    title: "AI Reading Companion",
    description:
      "Streaming conversations about what you're reading, what you've read, and what connects them. Save insights directly to your library.",
  },
  {
    icon: BarChart3,
    title: "Predicted Ratings",
    description:
      "Every unread book scored based on your actual reading patterns\u2009\u2014\u2009not what's popular, what's right for you.",
  },
  {
    icon: GraduationCap,
    title: "Curated Syllabi",
    description:
      "AI-crafted reading courses that thread books together by theme, argument, or emotional arc.",
  },
  {
    icon: Layers,
    title: "Visual Shelves",
    description:
      "Your library as a space to inhabit\u2009\u2014\u2009browse by mood, season, genre, or create your own collections.",
  },
  {
    icon: Newspaper,
    title: "New Releases",
    description:
      "Upcoming books scored for general signal and personal relevance, so you never miss a book that's right for you.",
  },
  {
    icon: Sparkles,
    title: "Reader Profile",
    description:
      "A living portrait of your literary identity that deepens every time you read, reflect, and converse.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-serif text-xl font-bold tracking-tight">
          Rekollekt
        </span>
        <Link
          to="/home"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Go to your library <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-16 text-center sm:pt-24">
        <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Rekollekt
        </h1>
        <p className="mt-6 font-serif text-xl leading-relaxed text-muted-foreground italic sm:text-2xl">
          Return to your books. Discover what they left behind.
        </p>
        <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          A reading companion that helps you reflect on what you've read,
          understand your evolving taste, and find your next great book&thinsp;&mdash;&thinsp;not
          through ratings and reviews, but through conversation and recollection.
        </p>
        <Link
          to="/home"
          className="mt-10 inline-flex items-center gap-2 rounded-lg bg-foreground px-8 py-3 text-sm font-semibold text-background shadow-md transition-all hover:opacity-90 hover:-translate-y-0.5"
        >
          Enter Your Library
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <hr className="border-border" />
      </div>

      {/* Value Props */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="grid gap-12 sm:grid-cols-3 sm:gap-8">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title} className="text-center sm:text-left">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                <prop.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="mb-2 font-serif text-xl font-bold">
                {prop.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {prop.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto max-w-5xl px-6">
        <hr className="border-border" />
      </div>

      {/* Features Grid */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="mb-4 text-center font-serif text-3xl font-bold tracking-tight">
          Everything in service of deeper reading
        </h2>
        <p className="mx-auto mb-16 max-w-xl text-center text-base text-muted-foreground">
          Tools that learn from you and work for you&thinsp;&mdash;&thinsp;not the other way around.
        </p>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-card p-6"
            >
              <feature.icon className="mb-3 h-5 w-5 text-accent" />
              <h3 className="mb-2 font-serif text-lg font-bold">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Philosophy */}
      <section className="bg-card">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="mb-8 font-serif text-3xl font-bold tracking-tight">
            Reading is not a metric.
          </h2>
          <p className="text-base leading-loose text-muted-foreground sm:text-lg sm:leading-loose">
            Most book apps have drifted toward social performance and
            goal-chasing&thinsp;&mdash;&thinsp;read counts, public ratings, challenges completed.
            Rekollekt is the antidote. We believe the most meaningful reading
            happens in the space between finishing a book and starting the next
            one&thinsp;&mdash;&thinsp;in recollection, in conversation, in the slow accumulation
            of a life shaped by literature.
          </p>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="mb-8 font-serif text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
          Ready to remember what your books taught you?
        </p>
        <Link
          to="/home"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-8 py-3 text-sm font-semibold text-background shadow-md transition-all hover:opacity-90 hover:-translate-y-0.5"
        >
          Get Started
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Rekollekt
      </footer>
    </div>
  );
}
