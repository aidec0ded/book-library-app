import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { supabase } from "@/lib/supabase";
import { exportLibraryCSV } from "@/lib/export";

export function Settings() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const {
    plan,
    isPaid,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    isLoading: subLoading,
    refreshSubscription,
  } = useSubscription();

  const isGoogleUser = user?.app_metadata?.provider === "google";

  const [portalLoading, setPortalLoading] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Export state
  const [exportLoading, setExportLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Delete account state
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 6) {
      setPasswordStatus({
        type: "error",
        message: "Password must be at least 6 characters.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: "error",
        message: "Passwords do not match.",
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setPasswordStatus({
        type: "success",
        message: "Password updated successfully.",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordStatus({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to update password.",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleExport = async () => {
    setExportStatus(null);
    setExportLoading(true);
    try {
      const { count } = await exportLibraryCSV();
      setExportStatus({
        type: "success",
        message: `Exported ${count} book${count === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      setExportStatus({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to export library.",
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeleteLoading(true);

    try {
      const token = session?.access_token;
      if (!token) throw new Error("No active session");

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account");
      }

      await supabase.auth.signOut();
      navigate("/");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete account.",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fall through
    } finally {
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async (billing: "monthly" | "annual") => {
    const token = session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: billing }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fall through
    }
  };

  // Refetch subscription after checkout redirect
  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") === "success") {
    void refreshSubscription();
  }

  const planLabel =
    plan === "annual"
      ? "Reading Companion (Annual)"
      : plan === "monthly"
        ? "Reading Companion (Monthly)"
        : "Free";

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-8 font-serif text-2xl font-bold tracking-tight">
        Settings
      </h1>

      {/* Subscription */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold">Subscription</h2>

          {subLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : isPaid ? (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-medium">{planLabel}</span>
                {plan === "monthly" && (
                  <span className="text-muted-foreground"> — $7/month</span>
                )}
                {plan === "annual" && (
                  <span className="text-muted-foreground"> — $60/year</span>
                )}
              </p>
              {currentPeriodEnd && (
                <p className="text-sm text-muted-foreground">
                  {cancelAtPeriodEnd
                    ? `Your subscription ends on ${new Date(currentPeriodEnd).toLocaleDateString()}`
                    : `Next billing date: ${new Date(currentPeriodEnd).toLocaleDateString()}`}
                </p>
              )}
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {portalLoading ? "Loading..." : "Manage subscription"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You're on the <span className="font-medium text-foreground">Free</span> plan — 5 chat messages per month, full library management.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleUpgrade("monthly")}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm hover:bg-accent/90"
                >
                  Upgrade — $7/mo
                </button>
                <button
                  onClick={() => handleUpgrade("annual")}
                  className="rounded-md border border-accent/30 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/5"
                >
                  $60/year (save $24)
                </button>
              </div>
              <Link
                to="/pricing"
                className="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Compare plans →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold">Password</h2>

          {isGoogleUser ? (
            <p className="text-sm text-muted-foreground">
              Your account is signed in with Google. Password management is
              handled through your Google account.
            </p>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1 block text-sm font-medium"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1 block text-sm font-medium"
                >
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  autoComplete="new-password"
                />
              </div>

              {passwordStatus && (
                <p
                  className={`text-sm ${
                    passwordStatus.type === "success"
                      ? "text-green-600"
                      : "text-destructive"
                  }`}
                >
                  {passwordStatus.message}
                </p>
              )}

              <button
                type="submit"
                disabled={
                  passwordLoading || !newPassword || !confirmPassword
                }
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {passwordLoading ? "Updating..." : "Update password"}
              </button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <h2 className="mb-2 text-lg font-semibold">Export library</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Download your entire library as a CSV file — titles, authors,
            ratings, status, notes, and metadata. Your data is yours.
          </p>

          {exportStatus && (
            <p
              className={`mb-3 text-sm ${
                exportStatus.type === "success"
                  ? "text-green-600"
                  : "text-destructive"
              }`}
            >
              {exportStatus.message}
            </p>
          )}

          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {exportLoading ? "Exporting..." : "Download CSV"}
          </button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardContent className="pt-6">
          <h2 className="mb-2 text-lg font-semibold text-destructive">
            Delete account
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            This will permanently delete your account and all associated data
            — books, conversations, reading profile, syllabi, and shelves.
            This action cannot be undone.
          </p>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="delete-confirm"
                className="mb-1 block text-sm font-medium"
              >
                Type <span className="font-mono">delete my account</span> to
                confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="off"
              />
            </div>

            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}

            <button
              onClick={handleDeleteAccount}
              disabled={
                deleteConfirmation !== "delete my account" || deleteLoading
              }
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleteLoading
                ? "Deleting..."
                : "Permanently delete account"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
