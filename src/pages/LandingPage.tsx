import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function LandingPage() {
  const { session } = useAuth();
  const entryLink = session ? "/home" : "/login";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <nav className="flex w-full items-center justify-between px-6 py-8 md:px-12 lg:px-24">
        <span className="font-serif text-2xl font-bold tracking-tight">
          Rekollekt
        </span>
        <div className="hidden items-center gap-10 sm:flex">
          <Link to="/philosophy" className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground">
            Philosophy
          </Link>
          <a href="#" className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#" className="text-base font-semibold text-muted-foreground transition-colors hover:text-foreground">
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

      {/* Hero */}
      <main className="flex flex-1 items-center px-6 md:px-12 lg:px-24">
        <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-24">
          {/* Left: Headline + CTA */}
          <div className="order-2 flex flex-col lg:order-1 lg:col-span-5">
            <h1 className="font-serif text-7xl font-bold leading-[0.9] tracking-tight md:text-8xl lg:text-[10rem]">
              Know{" "}
              <br />
              <span className="font-normal italic text-muted-foreground">
                thy shelf.
              </span>
            </h1>
            <p className="mt-8 max-w-md text-lg leading-relaxed text-muted-foreground">
              Your reading life, understood.
            </p>
            <div className="mt-10">
              <Link
                to={entryLink}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-all hover:opacity-90"
              >
                {session ? "Go to library" : "Get started"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Right: Illustration */}
          <div className="order-1 flex items-center justify-center lg:order-2 lg:col-span-7">
            <img
              src="/landing-illustration.png"
              alt="A person sitting cross-legged with a book, beside a small wooden bookshelf"
              className="w-full max-w-2xl"
            />
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
