import { supabase } from "@/lib/supabase";

export async function fetchOnboardingStatus(): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("onboarding_completed_at")
    .single();

  if (error) {
    // If no row exists, treat as not completed
    return false;
  }

  return data.onboarding_completed_at != null;
}

export async function completeOnboarding(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const response = await fetch("/api/onboarding/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to complete onboarding");
  }
}
