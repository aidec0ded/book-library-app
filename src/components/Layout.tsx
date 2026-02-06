import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { ChatPanel } from "@/components/ChatPanel";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ChatProvider>
      <div className="min-h-screen lg:pl-60">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Mobile header */}
        <header className="flex items-center gap-3 border-b px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="font-serif text-lg font-bold tracking-tight">
            MoodLib
          </Link>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          <Outlet />
        </main>

        <ChatPanel />
      </div>
    </ChatProvider>
  );
}
