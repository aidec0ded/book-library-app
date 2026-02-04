import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-4">
          <Link to="/" className="text-xl font-bold tracking-tight">
            MoodLib
          </Link>
          <nav className="flex gap-4">
            <Link
              to="/seasonal"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Seasonal
            </Link>
            <Link
              to="/vibes"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Vibes
            </Link>
            <Link
              to="/chat"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Chat
            </Link>
            <Link
              to="/add"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Add Book
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
