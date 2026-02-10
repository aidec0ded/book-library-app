import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const STEPS = [
  {
    numeral: "I",
    title: "Read",
    text: "Yes, it all starts with opening a book, but that's why you're here.",
  },
  {
    numeral: "II",
    title: "Reflect",
    text: "Many of us don't reflect on what we're reading enough. Rekollekt provides several ways to develop this habit. If you prefer your own notes and annotations, there's space for that here. If you love chatting about your books and want someone to challenge your understanding, you can do that here, too. When you finish a book, you can rate it. I encourage you to use these features as much as possible\u2014they're the primary ways to understand what kind of books resonate with you and how to find others that will have similar impact.",
  },
  {
    numeral: "III",
    title: "AI understanding deepens",
    text: "Yes, there's a large AI component to Rekollekt, but I believe you'll find it useful. An AI reading companion helps you dive deeper into the books you're reading, making connections to insights you've gleaned from other books in your library, helping you identify themes of resonance, and helping you understand your evolving view of yourself and the world. Unread books in your library will have a predicted rating applied to them, using your notes, conversations, and previous ratings to make your next-book selection easier. If you find an author, topic, or literary movement that interests you, Rekollekt will develop a course around it, with a reading list and guide for how to engage with the texts. We're using technology for good here.",
  },
  {
    numeral: "IV",
    title: "Better recommendations & insights",
    text: "The more you interact with the site\u2014adding notes, providing ratings, having conversations\u2014the more the AI learns about you and your preferences, and the better its recommendations become. It will learn to act as a better mirror in conversation, helping you probe deeper.",
  },
  {
    numeral: "V",
    title: "Read more intentionally",
    text: "I want to help you become a reader who better engages with the books you spend time with. Everything I've built here is with that goal in mind.",
  },
];

const LOOP_LABELS = ["Read", "Reflect", "AI", "Insights", "Intent"];

function CoreLoopDiagram() {
  const cx = 200;
  const cy = 200;
  const r = 150;
  const nodeR = 40;
  // 5 evenly spaced points starting from top (-90deg)
  const points = LOOP_LABELS.map((_, i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  return (
    <div className="relative mx-auto w-full max-w-md aspect-square">
      <svg viewBox="0 0 400 400" className="w-full h-full">
        {/* Outer orbit ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-border"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 8"
          className="text-muted-foreground/30"
        />
        {/* Center filled circle */}
        <circle
          cx={cx}
          cy={cy}
          r={50}
          className="fill-foreground"
        />
        {/* Center label */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-background text-xs"
          style={{ fontVariant: "small-caps", letterSpacing: "0.15em" }}
        >
          the
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          className="fill-background font-serif text-xl italic"
        >
          Loop
        </text>
        {/* Nodes */}
        {points.map((p, i) => (
          <g key={LOOP_LABELS[i]}>
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeR}
              className="fill-background stroke-border"
              strokeWidth={1}
            />
            <text
              x={p.x}
              y={p.y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-sm italic fill-foreground"
            >
              {LOOP_LABELS[i]}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function PhilosophyPage() {
  const { session } = useAuth();
  const entryLink = session ? "/home" : "/login";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav — same as landing page */}
      <nav className="flex w-full items-center justify-between px-6 py-8 md:px-12 lg:px-24">
        <Link to="/" className="font-serif text-2xl font-bold tracking-tight">
          Rekollekt
        </Link>
        <div className="hidden items-center gap-10 sm:flex">
          <Link
            to="/philosophy"
            className="text-base font-semibold text-foreground transition-colors"
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

      {/* Header */}
      <header className="mx-auto max-w-4xl px-6 pt-16 pb-12 text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-foreground/20" />
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Philosophy
          </span>
          <span className="h-px w-8 bg-foreground/20" />
        </div>
        <h1 className="font-serif text-5xl font-normal leading-[1.1] tracking-tight md:text-7xl">
          Why{" "}
          <span className="italic text-muted-foreground">Rekollekt</span>
        </h1>
      </header>

      {/* Main content area with sidebar */}
      <div className="mx-auto max-w-6xl px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 pb-20">
        {/* Sticky sidebar TOC */}
        <aside className="hidden lg:block lg:col-span-2">
          <div className="sticky top-8">
            <div className="border-l border-border pl-4 space-y-3">
              <h6 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Structure
              </h6>
              {STEPS.map((step) => (
                <a
                  key={step.numeral}
                  href={`#step-${step.numeral}`}
                  className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {step.numeral}. {step.title.length > 18 ? step.title.slice(0, 18) + "\u2026" : step.title}
                </a>
              ))}
            </div>
          </div>
        </aside>

        {/* Center column — the essay */}
        <article className="lg:col-span-8 lg:px-8">
          {/* Opening paragraphs with drop cap */}
          <div className="mx-auto max-w-[975px] text-[1.375rem] leading-[1.8] text-foreground/90 space-y-7">
            <p className="first-letter:float-left first-letter:text-[5rem] first-letter:leading-[0.8] first-letter:pr-3 first-letter:pt-1 first-letter:font-serif">
              The optimization and gamification of everything has reached our
              reading lives. Setting goals to read 52, 100, even 250 books a
              year is commonplace, and entire communities have formed around
              these challenges. Reading more is great, but I believe it
              shouldn't be the end goal. Instead, I believe in reading{" "}
              <strong><em>more meaningfully</em></strong>.
            </p>
            <p>
              Many of our bookshelves are filled with books we were once
              excited to read, but which lost their appeal when the next
              &ldquo;it&rdquo; books came along. We get caught up in bookish
              conversations on social platforms, longing to be part of
              whatever literary zeitgeist is taking place.
            </p>
            <p>
              I created Rekollekt as an antidote to the current reading
              culture. I wanted to build something that helps readers
              understand how books affect them, and uses that understanding to
              guide what they read next. It exists for readers who want a
              personal, reflective relationship with their library&mdash;a
              space where you can celebrate your own collection and get
              excited to step into it.
            </p>
          </div>

          {/* Pull quote */}
          <blockquote className="my-20 text-center">
            <p className="mx-auto max-w-lg font-serif text-2xl italic leading-snug text-foreground/80 md:text-3xl">
              &ldquo;I created Rekollekt as an antidote to the current reading culture.&rdquo;
            </p>
          </blockquote>

          {/* The app loop intro */}
          <div className="mx-auto max-w-[975px] text-[1.375rem] leading-[1.8] text-foreground/90 mb-8">
            <p>The app is designed around this simple loop:</p>
          </div>

          {/* Core Loop Diagram */}
          <div className="my-16 py-12 border-y border-border">
            <h3 className="mb-10 text-center text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
              The Core Loop
            </h3>
            <CoreLoopDiagram />
          </div>

          {/* Steps */}
          <div className="space-y-20 mb-20">
            {STEPS.map((step) => (
              <div key={step.numeral} id={`step-${step.numeral}`} className="group relative mx-auto max-w-[975px]">
                <span className="absolute -left-4 top-0 font-serif text-7xl font-light text-foreground/10 select-none md:-left-16 md:text-8xl">
                  {step.numeral}
                </span>
                <div className="relative pt-4 md:pt-6">
                  <h3 className="mb-4 font-serif text-2xl">
                    <span className="text-muted-foreground">{step.numeral}.</span>{" "}
                    {step.title}
                  </h3>
                  <p className="text-[1.375rem] leading-[1.8] text-foreground/80">
                    {step.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Second pull quote */}
          <blockquote className="my-20 text-center">
            <p className="mx-auto max-w-lg font-serif text-2xl italic leading-snug text-foreground/80 md:text-3xl">
              &ldquo;The more you interact with the site, the more value you'll gain.&rdquo;
            </p>
          </blockquote>
        </article>

        {/* Right spacer for balance */}
        <div className="hidden lg:block lg:col-span-2" />
      </div>

      {/* Anamnesis coda */}
      <section className="border-t border-border bg-card py-20">
        <div className="mx-auto max-w-[975px] px-6 text-center">
          <h2 className="mb-2 font-serif text-4xl font-normal text-accent md:text-5xl">
            Anamnesis
          </h2>
          <p className="mb-10 text-[1.375rem] italic text-muted-foreground">
            /&#716;an&#601;m&#712;n&#618;&#720;s&#618;s/ &bull; The remembering
            of things from a supposed previous existence.
          </p>
          <div className="mx-auto max-w-3xl text-[1.375rem] leading-[1.8] text-foreground/80 space-y-7">
            <p>
              There's a Platonic concept,{" "}
              <em>anamnesis</em>, that claims learning involves rediscovering
              knowledge within oneself. I named the site Rekollekt to extend
              that idea. If we own books, we own a wealth of knowledge at our
              fingertips, waiting to be rediscovered. I believe in choosing
              understanding over consumption.
            </p>
          </div>

          {/* Sign-off */}
          <div className="mt-16 space-y-3">
            <p className="text-[1.375rem] italic text-foreground/80">
              I hope you like it here.
            </p>
            <p
              className="text-4xl text-foreground/70"
              style={{ fontFamily: "'Caveat', cursive" }}
            >
              Robert
            </p>
          </div>

          {/* CTA */}
          <div className="mt-16">
            <Link
              to={entryLink}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-all hover:opacity-90"
            >
              {session ? "Go to library" : "Get started"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
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
