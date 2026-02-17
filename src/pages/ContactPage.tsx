import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useRef, FormEvent } from "react";

export function ContactPage() {
  const { session } = useAuth();
  const entryLink = session ? "/home" : "/login";
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "";
    el.style.height = el.scrollHeight + "px";
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = formRef.current!;
      const data = new FormData(form);
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
        }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again or email directly.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full bg-transparent border-0 border-b border-foreground/20 py-3 text-xl text-foreground placeholder:text-foreground/20 focus:border-accent focus:ring-0 focus:outline-none transition-colors duration-300";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
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
            className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            FAQ
          </Link>
          <Link
            to="/contact"
            className="text-base font-semibold text-foreground transition-colors"
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

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl flex-grow px-6 pb-16 md:px-12 lg:px-24">
        <div className="flex flex-col lg:flex-row">
          {/* Left column — contact info pushed to bottom */}
          <div className="flex w-full flex-col justify-between pb-8 pt-12 lg:w-[38%] lg:pr-16">
            <div className="hidden flex-grow lg:block" />
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Contact
                </span>
              </div>
              <a
                href="mailto:robert@aidecoded.ai"
                className="text-2xl transition-colors hover:text-accent lg:text-3xl"
              >
                robert@aidecoded.ai
              </a>
            </div>
          </div>

          {/* Right column — headline + form */}
          <div className="w-full pt-12 lg:w-[62%] lg:border-l lg:border-foreground/10 lg:pl-16">
            <h1 className="mb-16 font-serif text-4xl font-light leading-[1.15] md:text-5xl lg:text-6xl">
              Have a question, a suggestion, or just want to say hello?{" "}
              <span className="italic text-muted-foreground">
                I'd love to hear from you.
              </span>
            </h1>

            {submitted ? (
              <div className="max-w-2xl py-12">
                <h2 className="mb-4 font-serif text-3xl">
                  Thank you for reaching out.
                </h2>
                <p className="text-lg text-muted-foreground">
                  We'll get back to you as soon as we can.
                </p>
              </div>
            ) : (
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                className="flex max-w-2xl flex-col gap-10"
              >
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    placeholder="Jane Doe"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    placeholder="jane@example.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="message"
                    className="mb-2 block text-sm font-medium text-muted-foreground"
                  >
                    Message
                  </label>
                  <textarea
                    ref={textareaRef}
                    id="message"
                    name="message"
                    required
                    rows={1}
                    placeholder="Tell us everything..."
                    onInput={handleTextareaInput}
                    className={`${inputClass} resize-none overflow-hidden`}
                  />
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your message comes directly to me. I'll respond as soon as
                  I can.
                </p>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <div className="mt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group inline-flex items-center gap-4 rounded-full bg-foreground px-8 py-3.5 text-base font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    <span>{submitting ? "Sending..." : "Send"}</span>
                    <span className="h-px w-6 bg-current opacity-50 transition-all group-hover:w-10" />
                    <span className="font-serif italic">Message</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

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
