import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { capture } from "@/lib/posthog";
import {
  COMPANION_ANNUAL_PRICE,
  COMPANION_MONTHLY_PRICE,
  COMPANION_MONTHLY_REPLIES,
  FREE_MONTHLY_REPLIES,
  FREE_PERIOD_BILLING_STARTS,
  FREE_PERIOD_LAST_DAY,
  inFreePeriod,
} from "@/lib/plans";

const FREE_FEATURES = [
  "Your whole library: search, shelves, notes, and reading dates",
  "Goodreads import",
  "Tags and predicted ratings for every book",
  "A reader profile, with a new one each month you're reading",
  "Personalized recommendations and new release picks",
  "Save anything from a conversation to a book's page",
  `${FREE_MONTHLY_REPLIES} replies a month from your reading companion`,
];

const PAID_FEATURES = [
  "Everything in Free",
  `Up to ${COMPANION_MONTHLY_REPLIES} replies a month from your reading companion`,
  "Syllabi and reading paths, built with the companion",
  "Insights from book conversations saved for you",
  "Refresh your reader profile weekly",
];

const ANNUAL_SAVING = COMPANION_MONTHLY_PRICE * 12 - COMPANION_ANNUAL_PRICE;

export function PricingPage() {
  const { session } = useAuth();
  const entryLink = session ? "/home" : "/login";
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [loading, setLoading] = useState(false);
  const freePeriod = inFreePeriod();

  async function handleUpgrade() {
    if (!session) return;
    capture("checkout_started", { plan: billing });
    setLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: billing }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fall through — user can retry
    } finally {
      setLoading(false);
    }
  }

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
            className="text-base font-semibold text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/faq"
            className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
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

      {/* Hero */}
      <section className="px-6 pb-16 pt-12 md:px-12 lg:px-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
            Read more intentionally
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Rekollekt is free to use. Companion gives you more time with your
            reading companion, and the syllabi and reading paths you build together.
          </p>
          {freePeriod && (
            <p className="mx-auto mt-6 max-w-xl rounded-2xl bg-accent/10 px-5 py-4 text-sm text-foreground">
              <span className="font-semibold">Free while we launch.</span> Everyone has Companion
              at no charge through {FREE_PERIOD_LAST_DAY}. No card needed. After that, Rekollekt
              stays free, and Companion is ${COMPANION_MONTHLY_PRICE} a month if you want to keep it.
            </p>
          )}
        </div>
      </section>

      {/* Billing toggle */}
      <div className="flex justify-center pb-12">
        <div className="flex items-center gap-3 rounded-full bg-muted/50 p-1">
          <button
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              billing === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              billing === "annual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
            <span className="ml-1.5 text-xs text-accent">Save ${ANNUAL_SAVING}</span>
          </button>
        </div>
      </div>

      {/* Pricing cards */}
      <section className="px-6 pb-24 md:px-12 lg:px-24">
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          {/* Free tier */}
          <div className="rounded-2xl border bg-card p-8">
            <div className="mb-6">
              <h2 className="font-serif text-2xl font-bold">Free</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Everything you need to build and explore your library.
              </p>
            </div>
            <div className="mb-8">
              <span className="font-serif text-4xl font-bold">$0</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <Link
              to={session ? "/home" : "/login"}
              className="block w-full rounded-full border border-foreground/20 py-3 text-center text-sm font-medium transition-colors hover:bg-muted"
            >
              {session ? "Go to your library" : "Get started free"}
            </Link>
            <ul className="mt-8 space-y-3">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Paid tier */}
          <div className="rounded-2xl border-2 border-accent/30 bg-card p-8 shadow-lg shadow-accent/5">
            <div className="mb-6">
              <div className="mb-3 inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                Reading Companion
              </div>
              <h2 className="font-serif text-2xl font-bold">Companion</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Longer conversations with your reading companion, and what you build together.
              </p>
            </div>
            <div className="mb-8">
              <span className="font-serif text-4xl font-bold">
                ${billing === "monthly" ? COMPANION_MONTHLY_PRICE : Math.round((COMPANION_ANNUAL_PRICE / 12) * 100) / 100}
              </span>
              <span className="text-muted-foreground">/month</span>
              {billing === "annual" && (
                <span className="ml-2 text-sm text-muted-foreground">
                  billed ${COMPANION_ANNUAL_PRICE}/year
                </span>
              )}
            </div>
            {session ? (
              <>
                <button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="block w-full rounded-full bg-accent py-3 text-center text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {loading ? "Redirecting..." : freePeriod ? "Subscribe now" : "Upgrade now"}
                </button>
                {freePeriod && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    You won't be charged until {FREE_PERIOD_BILLING_STARTS}.
                  </p>
                )}
              </>
            ) : (
              <Link
                to="/login"
                className="block w-full rounded-full bg-accent py-3 text-center text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
              >
                {freePeriod ? "Get started free" : "Get started"}
              </Link>
            )}
            <ul className="mt-8 space-y-3">
              {PAID_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ link */}
      <section className="border-t px-6 py-16 text-center md:px-12 lg:px-24">
        <p className="text-muted-foreground">
          Have questions?{" "}
          <Link to="/faq" className="font-medium text-foreground underline hover:text-accent">
            Read the FAQ
          </Link>
          {" "}or{" "}
          <Link to="/contact" className="font-medium text-foreground underline hover:text-accent">
            get in touch
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
