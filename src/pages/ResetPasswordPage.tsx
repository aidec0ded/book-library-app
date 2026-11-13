import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { capture } from "@/lib/posthog";

/**
 * Where the "reset your password" email lands. The link signs the reader in for this
 * one purpose, then they choose a new password.
 *
 * Two kinds of link work:
 * - ?token_hash=…&type=recovery, from the email template set up in Supabase (Auth →
 *   Emails → Reset password). It works on any device, so a reader can ask on their
 *   laptop and open the email on their phone.
 * - ?code=…, Supabase's default link. supabase-js exchanges it on page load, but only in
 *   the browser that asked for the reset, since that's where the PKCE verifier is kept.
 */

type Stage = "checking" | "ready" | "invalid" | "done";

const MIN_PASSWORD_LENGTH = 6; // Supabase Auth's minimum

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let settled = false;
    const settle = (next: Stage) => {
      if (settled) return;
      settled = true;
      setStage(next);
    };

    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // An expired or already-used link comes back with an error instead of a token
    if (params.get("error") || hash.get("error")) {
      settle("invalid");
      return;
    }

    const tokenHash = params.get("token_hash");
    if (tokenHash) {
      void supabase.auth
        .verifyOtp({ type: "recovery", token_hash: tokenHash })
        .then(({ error: otpError }) => settle(otpError ? "invalid" : "ready"));
      return;
    }

    // A ?code= link: supabase-js signs in from it on its own; wait for that
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        settle("ready");
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle("ready");
    });
    // No session after a few seconds: the link didn't work here
    const timer = window.setTimeout(() => settle("invalid"), params.get("code") ? 8000 : 1500);
    return () => {
      listener.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(
        updateError.message.toLowerCase().includes("different from the old")
          ? "That's your current password. Choose a different one."
          : updateError.message,
      );
      return;
    }
    capture("password_reset_completed");
    setStage("done");
    window.setTimeout(() => navigate("/home", { replace: true }), 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link to="/" className="font-serif text-2xl font-bold tracking-tight">
            Rekollekt
          </Link>
        </div>

        {stage === "checking" && (
          <p className="text-center text-sm text-muted-foreground">Checking your link…</p>
        )}

        {stage === "invalid" && (
          <div className="text-center">
            <h1 className="font-serif text-2xl font-bold tracking-tight">This link didn't work</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Reset links work once, for an hour. If you opened it on a different device or browser
              from where you asked for it, try asking again from this one.
            </p>
            <Link
              to="/login?forgot=1"
              className="mt-6 inline-block text-sm font-medium text-foreground hover:underline"
            >
              Send a new link
            </Link>
          </div>
        )}

        {stage === "done" && (
          <div className="text-center">
            <h1 className="font-serif text-2xl font-bold tracking-tight">Password updated</h1>
            <p className="mt-3 text-sm text-muted-foreground">Taking you to your library…</p>
          </div>
        )}

        {stage === "ready" && (
          <>
            <h1 className="text-center font-serif text-2xl font-bold tracking-tight">
              Choose a new password
            </h1>
            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <input
                type="password"
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "..." : "Save password"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
