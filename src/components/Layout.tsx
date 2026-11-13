import { useState, useEffect } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ChatProvider } from "@/contexts/ChatContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { ChatPanel } from "@/components/ChatPanel";
import { supabase } from "@/lib/supabase";
import { useProfileGeneration } from "@/hooks/useProfileGeneration";

const PROFILE_SEEN_KEY = "rekollekt_profile_seen_at";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileBanner, setProfileBanner] = useState(false);
  const [offerDismissed, setOfferDismissed] = useState(false);
  const navigate = useNavigate();
  // A monthly profile waiting for the reader, generated with a click from the banner
  const { status: profileStatus, generate, requesting } = useProfileGeneration(() => setProfileBanner(true));
  const offerProfile = !offerDismissed && (profileStatus?.monthly_available || profileStatus?.generating);

  useEffect(() => {
    let cancelled = false;

    async function checkProfile() {
      const { data, error } = await supabase
        .from("reader_profile")
        .select("generated_at")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || error || !data) return;

      const seenAt = localStorage.getItem(PROFILE_SEEN_KEY);
      if (!seenAt || new Date(data.generated_at) > new Date(seenAt)) {
        setProfileBanner(true);
      }
    }

    void checkProfile();
    return () => { cancelled = true; };
  }, []);

  function dismissBanner() {
    setProfileBanner(false);
    localStorage.setItem(PROFILE_SEEN_KEY, new Date().toISOString());
  }

  return (
    <SubscriptionProvider>
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
          <Link to="/home" className="font-serif text-lg font-bold tracking-tight">
            Rekollekt
          </Link>
        </header>

        {/* A monthly profile is ready to generate, or generating */}
        {offerProfile && !profileBanner && (
          <div className="border-b bg-accent/10 px-4 py-2.5">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              {profileStatus?.generating ? (
                <p className="text-sm text-foreground">
                  Writing your new reader profile. This takes about a minute; you can keep reading.
                </p>
              ) : (
                <button
                  onClick={() => void generate()}
                  disabled={requesting}
                  className="text-left text-sm text-foreground hover:underline disabled:opacity-60"
                >
                  {profileStatus?.error
                    ? "Your new reader profile didn't finish."
                    : "There's been enough reading for a new reader profile."}{" "}
                  <span className="font-medium text-accent">
                    {requesting ? "Starting…" : profileStatus?.error ? "Try again →" : "Generate it →"}
                  </span>
                </button>
              )}
              <button
                onClick={() => setOfferDismissed(true)}
                className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Profile update banner */}
        {profileBanner && (
          <div className="border-b bg-accent/10 px-4 py-2.5">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <button
                onClick={() => {
                  dismissBanner();
                  navigate("/profile");
                }}
                className="text-sm text-foreground hover:underline"
              >
                Your reader profile has been updated.{" "}
                <span className="font-medium text-accent">View profile →</span>
              </button>
              <button
                onClick={dismissBanner}
                className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <main className="mx-auto max-w-5xl px-4 py-6">
          <Outlet />
        </main>

        <ChatPanel />
      </div>
    </ChatProvider>
    </SubscriptionProvider>
  );
}
