import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { capture } from "@/lib/posthog";

/**
 * Profiles the reader generates (server/profile-scheduler.ts): whether a monthly profile
 * is waiting, whether a weekly refresh is possible, and asking for either. While one is
 * generating, the status is checked every 10 seconds, and `onGenerated` runs when it's
 * done.
 */

export interface ProfileStatus {
  has_profile: boolean;
  last_generated_at: string | null;
  monthly_available: boolean;
  generating: boolean;
  can_refresh: boolean;
  refresh_blocked: "too_soon" | "nothing_new" | "companion_only" | null;
  refresh_available_at: string | null;
  error: string | null;
}

const POLL_MS = 10_000;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export function useProfileGeneration(onGenerated?: () => void) {
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const wasGenerating = useRef(false);
  const onGeneratedRef = useRef(onGenerated);
  onGeneratedRef.current = onGenerated;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/status", { headers: await authHeaders() });
      if (!res.ok) return;
      const next = (await res.json()) as ProfileStatus;
      if (wasGenerating.current && !next.generating && !next.error) onGeneratedRef.current?.();
      wasGenerating.current = next.generating;
      setStatus(next);
    } catch {
      // Best-effort: the controls just don't show
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.generating) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [status?.generating, refresh]);

  const generate = useCallback(async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/profile/generate", { method: "POST", headers: await authHeaders() });
      const body = (await res.json().catch(() => ({}))) as { kind?: string };
      if (res.ok) capture("profile_generation_requested", { kind: body.kind });
    } finally {
      setRequesting(false);
      await refresh();
    }
  }, [refresh]);

  return { status, generate, requesting };
}
