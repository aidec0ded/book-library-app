import { useEffect, useState, useCallback, useMemo, createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { PersonalCanonEditor } from "@/components/PersonalCanonEditor";
import {
  fetchLatestProfile,
  fetchBooksByIds,
  updatePersonalCanon,
} from "@/lib/profile";
import { useActiveSlide } from "@/hooks/useActiveSlide";
import type { Book, ReaderProfile as ReaderProfileType } from "@/lib/types";

const PILLAR_COLORS = [
  "oklch(0.62 0.17 25)",  // terracotta
  "oklch(0.62 0.10 155)", // sage
  "oklch(0.58 0.12 260)", // slate
  "oklch(0.66 0.14 85)",  // amber
  "oklch(0.58 0.12 340)", // plum
  "oklch(0.62 0.14 180)", // teal
  "oklch(0.60 0.15 45)",  // rust
  "oklch(0.55 0.10 290)", // indigo
];

/** Parse **highlighted** markers into accent-styled spans */
function renderAccentText(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="rounded bg-accent/10 px-1 italic text-accent">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;
  // Split on **bold** first, then *italic* within non-bold segments
  const boldParts = text.split(/\*\*(.+?)\*\*/g);
  for (let i = 0; i < boldParts.length; i++) {
    if (i % 2 === 1) {
      nodes.push(<strong key={key++}>{boldParts[i]}</strong>);
    } else {
      const italicParts = boldParts[i].split(/\*(.+?)\*/g);
      for (let j = 0; j < italicParts.length; j++) {
        if (j % 2 === 1) {
          nodes.push(<em key={key++}>{italicParts[j]}</em>);
        } else if (italicParts[j]) {
          nodes.push(<span key={key++}>{italicParts[j]}</span>);
        }
      }
    }
  }
  return nodes;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Slide height ──
const SLIDE_HEIGHT = "h-[calc(100dvh-53px)] lg:h-dvh";

// ── Animation context ──
// Each Slide provides its active state; Anim children consume it.
const SlideActiveCtx = createContext(false);

// ── Slide type ──
interface SlideDef {
  id: string;
  bg?: string;
}

// ── SlideNav ──
function SlideNav({
  slides,
  activeIndex,
  onNavigate,
}: {
  slides: SlideDef[];
  activeIndex: number;
  onNavigate: (i: number) => void;
}) {
  return (
    <nav
      className="fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 sm:flex"
      aria-label="Slide navigation"
    >
      {slides.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onNavigate(i)}
          className={`rounded-full transition-all duration-300 ${
            i === activeIndex
              ? "h-6 w-2 bg-accent"
              : "h-3 w-1 bg-border hover:bg-muted-foreground/40"
          }`}
          aria-label={`Go to ${s.id}`}
        />
      ))}
    </nav>
  );
}

// ── Slide wrapper ──
function Slide({
  id,
  bg,
  isActive,
  children,
}: {
  id: string;
  bg?: string;
  isActive: boolean;
  children: ReactNode;
}) {
  return (
    <SlideActiveCtx.Provider value={isActive}>
      <section
        data-slide={id}
        className={`${SLIDE_HEIGHT} snap-start flex items-center justify-center px-6 sm:px-12 ${bg ?? ""}`}
      >
        <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto overscroll-contain scrollbar-hidden">
          {children}
        </div>
      </section>
    </SlideActiveCtx.Provider>
  );
}

// ── Anim wrapper ──
// Reads active state from SlideActiveCtx. Applies inline opacity + transform
// transition so no CSS class toggling is needed.
function Anim({
  from = "bottom",
  delay = 0,
  className = "",
  style: extraStyle,
  children,
}: {
  from?: "top" | "bottom";
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const isActive = useContext(SlideActiveCtx);
  const ty = from === "top" ? -30 : 30;

  return (
    <div
      className={className}
      style={{
        opacity: isActive ? 1 : 0,
        transform: isActive ? "none" : `translateY(${ty}px)`,
        transition: "opacity 600ms ease, transform 600ms ease",
        transitionDelay: isActive ? `${delay}ms` : "0ms",
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
export function Profile() {
  const [profile, setProfile] = useState<ReaderProfileType | null>(null);
  const [canonBooks, setCanonBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const p = await fetchLatestProfile();
        setProfile(p);
        if (p && p.profile_data.personal_canon.length > 0) {
          const books = await fetchBooksByIds(p.profile_data.personal_canon);
          setCanonBooks(books);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleCanonUpdate = useCallback(
    async (bookIds: string[]) => {
      if (!profile) return;
      const prevBooks = canonBooks;
      const prevProfile = profile;
      try {
        const newBooks = await fetchBooksByIds(bookIds);
        setCanonBooks(newBooks);
        setProfile({
          ...profile,
          profile_data: { ...profile.profile_data, personal_canon: bookIds },
        });
        await updatePersonalCanon(profile.id, bookIds);
      } catch {
        setCanonBooks(prevBooks);
        setProfile(prevProfile);
      }
    },
    [profile, canonBooks],
  );

  // ── Dynamic slide array ──
  const slides = useMemo<SlideDef[]>(() => {
    if (!profile) return [];
    const d = profile.profile_data;
    const s: SlideDef[] = [
      { id: "title", bg: "bg-[oklch(0.965_0.008_85)]" },
      { id: "identity", bg: "bg-[oklch(0.945_0.018_75)]" },
      { id: "pillars", bg: "bg-[#fbf8f7]" },
      { id: "evolution", bg: "bg-card" },
    ];
    if (d.taste_evolution.shift_log.length > 0) s.push({ id: "shifts" });
    s.push({ id: "emotions", bg: "bg-[oklch(0.950_0.022_25)]" });
    if (d.nonfiction_identity || d.poetry_identity) s.push({ id: "nonfiction-poetry" });
    s.push({ id: "canon", bg: "bg-card" });
    s.push({ id: "snapshot", bg: "bg-[#F5F0E8]" });
    return s;
  }, [profile]);

  const slideIndex = useMemo(() => {
    const m: Record<string, number> = {};
    slides.forEach((s, i) => { m[s.id] = i; });
    return m;
  }, [slides]);

  const { activeIndex, containerRef, scrollToSlide } = useActiveSlide(slides.length);

  // ── Loading / error / empty states ──
  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (error) return <div className="text-destructive">{error}</div>;
  if (!profile) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl font-bold">Reader Profile</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No profile generated yet. Generate one by running:
            </p>
            <code className="mt-2 block rounded bg-muted px-3 py-2 text-sm">
              npx tsx scripts/generate-profile.ts --bootstrap
            </code>
            <p className="mt-3 text-sm text-muted-foreground">
              After using the chat for a while, run without --bootstrap to
              include conversation context.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { profile_data: data } = profile;
  const hasNonfiction = !!data.nonfiction_identity;
  const hasPoetry = !!data.poetry_identity;
  const firstSentence = data.reader_identity.split(/(?<=\.)\s/)[0] ?? "";
  const remainingIdentity = data.reader_identity.slice(firstSentence.length).trimStart();

  const active = (id: string) => activeIndex === slideIndex[id];

  return (
    <>
      <SlideNav slides={slides} activeIndex={activeIndex} onNavigate={scrollToSlide} />
      <div
        ref={containerRef}
        className="fixed inset-0 top-[53px] z-10 overflow-y-auto snap-y snap-mandatory scrollbar-hidden lg:top-0 lg:left-60"
      >

      {/* ── 1. Title ── */}
      <Slide id="title" isActive={active("title")}>
        <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <Anim from="top">
            <p className="font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
              Generated {formatDate(profile.generated_at)}
            </p>
          </Anim>
          <Anim from="top" delay={100}>
            <h1 className="mt-6 font-serif text-5xl font-light italic tracking-tight leading-[0.9] sm:text-7xl lg:text-8xl">
              Reader Profile
            </h1>
          </Anim>
          <Anim from="bottom" delay={300}>
            <div className="mx-auto mt-12 max-w-2xl sm:mt-16">
              <div className="mx-auto mb-6 h-px w-12 bg-foreground/20" />
              <p className="font-serif text-xl font-light leading-snug text-muted-foreground sm:text-2xl lg:text-3xl">
                &ldquo;{firstSentence}&rdquo;
              </p>
            </div>
          </Anim>
          <Anim from="bottom" delay={500}>
            <div className="mt-12 flex animate-bounce flex-col items-center gap-1.5 text-muted-foreground/50">
              <span className="font-sans text-[10px] uppercase tracking-widest">Begin Review</span>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>
          </Anim>
        </div>
      </Slide>

      {/* ── 2. Identity ── */}
      <Slide id="identity" bg="bg-[oklch(0.945_0.018_75)]" isActive={active("identity")}>
        <div className="relative">
          <Anim from="top">
            <span
              className="pointer-events-none absolute -left-4 -top-20 select-none font-serif text-[160px] leading-none text-accent/[0.12] sm:-left-8"
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <div className="whitespace-pre-line text-center font-serif text-[18px] leading-[1.85] text-foreground/90 sm:text-left sm:text-[20px]">
              {renderInlineMarkdown(remainingIdentity)}
            </div>
          </Anim>
          <Anim from="bottom" delay={200}>
            <div className="mt-14 flex flex-col items-center sm:items-start">
              <div className="mb-4 h-0.5 w-12 bg-accent/50" />
              <p className="font-sans text-sm font-semibold uppercase tracking-widest text-accent/70">
                Your Reader Identity
              </p>
            </div>
          </Anim>
        </div>
      </Slide>

      {/* ── 3. Pillars ── */}
      <Slide id="pillars" isActive={active("pillars")}>
        <div>
          <Anim from="top">
            <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-[40px] sm:leading-tight">
              Thematic Pillars
            </h2>
            <p className="mt-2 font-serif text-lg italic text-muted-foreground">
              The clusters that define your reading taste
            </p>
          </Anim>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {data.thematic_pillars.map((pillar, i) => (
              <Anim
                key={i}
                from="bottom"
                delay={i * 100}
                className="flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: PILLAR_COLORS[i % PILLAR_COLORS.length],
                }}
              >
                <h3 className="font-serif text-lg font-bold leading-tight">{pillar.name}</h3>
                <p className="font-sans text-sm leading-relaxed text-muted-foreground">
                  {renderInlineMarkdown(pillar.description)}
                </p>
                {pillar.example_books.length > 0 && (
                  <div className="mt-auto border-t pt-2">
                    <p className="font-serif text-xs font-bold italic text-foreground/80">
                      {pillar.example_books.slice(0, 3).map(b => b.replace(/ by .+$/, "")).join(" · ")}
                    </p>
                  </div>
                )}
              </Anim>
            ))}
          </div>
        </div>
      </Slide>

      {/* ── 4. Evolution ── */}
      <Slide id="evolution" bg="bg-card" isActive={active("evolution")}>
        <div className="flex flex-col gap-10">
          <Anim from="top">
            <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Taste Evolution
            </h2>
          </Anim>
          <Anim from="top" delay={100}>
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/80">
                Current Gravitational Pulls
              </h3>
              <div className="rounded-r-lg border-l-4 border-accent bg-accent/[0.03] p-6 shadow-sm sm:p-8">
                <div className="whitespace-pre-line font-serif text-[15px] italic leading-[1.8] text-foreground/80">
                  {renderInlineMarkdown(data.taste_evolution.current_gravitational_pulls)}
                </div>
              </div>
            </div>
          </Anim>
          <Anim from="bottom" delay={200}>
            <hr className="border-t border-accent/10" />
          </Anim>
          <Anim from="bottom" delay={300}>
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-accent/80">
                Consistent Throughlines
              </h3>
              <div className="sm:px-8">
                <div className="whitespace-pre-line font-serif text-[15px] leading-[1.8] text-foreground/80">
                  {renderInlineMarkdown(data.taste_evolution.consistent_throughlines)}
                </div>
              </div>
            </div>
          </Anim>
        </div>
      </Slide>

      {/* ── 5. Shifts (conditional) ── */}
      {data.taste_evolution.shift_log.length > 0 && (
        <Slide id="shifts" isActive={active("shifts")}>
          <div>
            <Anim from="top">
              <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">Shift Log</h2>
              <p className="mt-2 font-serif text-lg italic text-muted-foreground">
                How your reading taste has evolved
              </p>
            </Anim>
            <div className="mt-8">
              {data.taste_evolution.shift_log.map((shift, i) => (
                <Anim key={i} from="bottom" delay={(i + 1) * 100} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
                    {i < data.taste_evolution.shift_log.length - 1 && (
                      <div className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="pb-5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {new Date(shift.noted_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                      })}
                    </span>
                    <p className="mt-0.5 text-sm leading-relaxed">
                      {renderInlineMarkdown(shift.description)}
                    </p>
                  </div>
                </Anim>
              ))}
            </div>
          </div>
        </Slide>
      )}

      {/* ── 6. Emotions ── */}
      <Slide id="emotions" bg="bg-[oklch(0.950_0.022_25)]" isActive={active("emotions")}>
        <div>
          <Anim from="top">
            <div className="mb-10 flex flex-col items-center">
              <span className="text-sm font-bold uppercase tracking-widest text-accent">
                Emotional Patterns
              </span>
              <div className="mt-2 h-1 w-10 rounded-full bg-accent/20" />
            </div>
          </Anim>
          {(() => {
            const splitIdx = data.emotional_patterns.indexOf("\n\n");
            const headline = splitIdx > -1 ? data.emotional_patterns.slice(0, splitIdx) : data.emotional_patterns;
            const body = splitIdx > -1 ? data.emotional_patterns.slice(splitIdx + 2) : "";
            return (
              <>
                <Anim from="bottom" delay={150} className="relative">
                  <span
                    className="pointer-events-none absolute -left-4 -top-14 select-none font-serif text-[140px] leading-none text-accent/[0.12] sm:-left-6 sm:-top-16 sm:text-[180px]"
                    aria-hidden="true"
                  >
                    &ldquo;
                  </span>
                  <p className="relative font-serif text-[24px] font-medium leading-[1.6] text-foreground sm:text-[28px] md:text-[34px] md:leading-[1.7]">
                    {renderAccentText(headline)}
                  </p>
                </Anim>
                {body && (
                  <Anim from="bottom" delay={300} className="mt-8">
                    <div className="whitespace-pre-line font-serif text-base leading-[1.8] text-foreground/70 sm:text-lg md:text-[20px] md:leading-[1.85]">
                      {renderInlineMarkdown(body)}
                    </div>
                  </Anim>
                )}
              </>
            );
          })()}
        </div>
      </Slide>

      {/* ── 7. Nonfiction + Poetry (conditional) ── */}
      {(hasNonfiction || hasPoetry) && (
        <Slide id="nonfiction-poetry" isActive={active("nonfiction-poetry")}>
          <div>
            <Anim from="top">
              <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">Beyond Fiction</h2>
            </Anim>
            <div className={`mt-6 grid gap-6 ${hasNonfiction && hasPoetry ? "sm:grid-cols-2" : ""}`}>
              {hasNonfiction && (
                <Anim
                  from="bottom"
                  delay={100}
                  className="rounded-lg border bg-card p-6"
                  style={{ borderTopWidth: 3, borderTopColor: "oklch(0.58 0.10 200)" }}
                >
                  <h3 className="font-serif text-lg font-bold">Nonfiction Identity</h3>
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {renderInlineMarkdown(data.nonfiction_identity!)}
                  </div>
                  {data.nonfiction_interests && data.nonfiction_interests.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {data.nonfiction_interests.map((interest, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-[oklch(0.92_0.03_200)] px-2.5 py-0.5 text-xs font-medium"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                </Anim>
              )}
              {hasPoetry && (
                <Anim
                  from="bottom"
                  delay={hasNonfiction ? 200 : 100}
                  className="rounded-lg border bg-card p-6"
                  style={{ borderTopWidth: 3, borderTopColor: "oklch(0.55 0.10 300)" }}
                >
                  <h3 className="font-serif text-lg font-bold">Poetry Identity</h3>
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {renderInlineMarkdown(data.poetry_identity!)}
                  </div>
                  {data.poet_affinities && data.poet_affinities.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {data.poet_affinities.map((poet, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-[oklch(0.92_0.03_300)] px-2.5 py-0.5 text-xs font-medium"
                        >
                          {poet}
                        </span>
                      ))}
                    </div>
                  )}
                </Anim>
              )}
            </div>
          </div>
        </Slide>
      )}

      {/* ── 8. Canon ── */}
      <Slide id="canon" bg="bg-card" isActive={active("canon")}>
        <div>
          <Anim from="top">
            <div className="text-center">
              <h2 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
                Personal Canon
              </h2>
              <p className="mx-auto mt-3 max-w-2xl font-serif text-lg italic text-muted-foreground">
                The books that define you as a reader
              </p>
              <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-accent" />
            </div>
          </Anim>
          <Anim from="bottom" delay={150} className="mt-10">
            <PersonalCanonEditor books={canonBooks} onUpdate={handleCanonUpdate} />
          </Anim>
        </div>
      </Slide>

      {/* ── 9. Snapshot ── */}
      <Slide id="snapshot" isActive={active("snapshot")}>
        <div className="space-y-8">
          <Anim from="top">
            <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-[40px] sm:leading-tight">
              Reading Life
            </h2>
          </Anim>

          {Object.keys(data.reading_life_snapshot.status_breakdown).length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(data.reading_life_snapshot.status_breakdown)
                .filter(([status]) => ["read", "unread", "reading", "wishlist"].includes(status))
                .sort(([, a], [, b]) => b - a)
                .map(([status, count], i) => (
                  <Anim
                    key={status}
                    from="bottom"
                    delay={(i + 1) * 80}
                    className="group rounded-xl border bg-card p-5 text-center shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="font-mono text-3xl font-bold tabular-nums transition-colors group-hover:text-accent sm:text-4xl">
                      {count.toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {status}
                    </div>
                  </Anim>
                ))}
            </div>
          )}

          <div className="mt-2 grid gap-8 sm:grid-cols-2">
            {data.reading_life_snapshot.currently_reading.length > 0 && (
              <Anim from="bottom" delay={400}>
                <h3 className="border-b pb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
                  Currently Reading
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {data.reading_life_snapshot.currently_reading.slice(0, 5).map((book, i) => (
                    <li key={i} className="font-serif text-lg italic leading-snug sm:text-xl">{book}</li>
                  ))}
                </ul>
              </Anim>
            )}
            {data.reading_life_snapshot.recently_finished.length > 0 && (
              <Anim from="bottom" delay={500}>
                <h3 className="border-b pb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
                  Recently Finished
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {data.reading_life_snapshot.recently_finished.slice(0, 5).map((book, i) => (
                    <li key={i} className="font-serif text-lg italic leading-snug sm:text-xl">{book}</li>
                  ))}
                </ul>
              </Anim>
            )}
          </div>

          {data.reading_life_snapshot.reading_pace_description && (
            <Anim from="bottom" delay={600} className="flex items-start gap-5 rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex-shrink-0 rounded-full bg-accent/10 p-3 text-accent">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Reading Pace
                </h3>
                <p className="mt-2 font-serif text-base leading-relaxed sm:text-lg">
                  {renderInlineMarkdown(data.reading_life_snapshot.reading_pace_description)}
                </p>
              </div>
            </Anim>
          )}
        </div>
      </Slide>
      </div>
    </>
  );
}
