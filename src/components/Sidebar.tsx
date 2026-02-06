import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Library,
  List,
  Compass,
  Sparkles,
  Newspaper,
  MessageCircle,
  User,
  PlusCircle,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface NavGroup {
  heading?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: "Home", path: "/", icon: Home }],
  },
  {
    heading: "Library",
    items: [
      { label: "Library", path: "/library", icon: Library },
      { label: "Lists", path: "/lists", icon: List },
    ],
  },
  {
    heading: "Discover",
    items: [
      { label: "Recommendations", path: "/recommendations", icon: Compass },
      { label: "Vibes", path: "/vibes", icon: Sparkles },
      { label: "New Releases", path: "/releases", icon: Newspaper },
    ],
  },
  {
    heading: "You",
    items: [
      { label: "Chat", path: "/chat", icon: MessageCircle },
      { label: "Profile", path: "/profile", icon: User },
    ],
  },
];

const FOOTER_ITEM: NavItem = {
  label: "Add Book",
  path: "/add",
  icon: PlusCircle,
};

function isActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  return pathname.startsWith(path);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-5 py-5">
        <Link
          to="/"
          onClick={onNavigate}
          className="font-serif text-xl font-bold tracking-tight text-sidebar-foreground"
        >
          MoodLib
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-5 px-3 py-2">
        {NAV_GROUPS.map((group, i) => (
          <div key={i}>
            {group.heading && (
              <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
                {group.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.path);
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer CTA */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <Link
          to={FOOTER_ITEM.path}
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors ${
            isActive(pathname, FOOTER_ITEM.path)
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          }`}
        >
          <PlusCircle className="h-4 w-4 shrink-0" />
          {FOOTER_ITEM.label}
        </Link>
      </div>
    </div>
  );
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { pathname } = useLocation();

  // Auto-close mobile sidebar on navigation
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <nav className="fixed left-0 top-0 hidden h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarContent />
      </nav>

      {/* Mobile overlay */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={onClose}
          />
          {/* Sliding panel */}
          <div className="fixed left-0 top-0 z-50 h-full w-60 bg-sidebar shadow-xl lg:hidden">
            <button
              onClick={onClose}
              className="absolute right-3 top-4 rounded-md p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={onClose} />
          </div>
        </>
      )}
    </>
  );
}
