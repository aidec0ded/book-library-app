import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { identifyUser } from "@/lib/posthog";

interface SubscriptionState {
  plan: "free" | "monthly" | "annual";
  status: string;
  chatMessagesUsed: number;
  chatMessagesLimit: number | null;
  chatMessagesRemaining: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Whether the reader gets Companion features: a subscription, or the free period */
  isPaid: boolean;
  /** Whether the reader has a paid subscription (billing, not features) */
  isSubscribed: boolean;
  /** When Companion ends for a reader who only has it from the free period */
  freePeriodEnds: string | null;
  /** A renewal failed and Stripe is retrying; the reader keeps Companion meanwhile */
  paymentPastDue: boolean;
  isLoading: boolean;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<"free" | "monthly" | "annual">("free");
  const [status, setStatus] = useState("active");
  const [chatMessagesUsed, setChatMessagesUsed] = useState(0);
  const [chatMessagesLimit, setChatMessagesLimit] = useState<number | null>(5);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [companion, setCompanion] = useState<boolean | null>(null);
  const [freePeriodEnds, setFreePeriodEnds] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch("/api/subscription", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) return;

      const data = await response.json();
      setPlan(data.plan);
      setStatus(data.status);
      setChatMessagesUsed(data.chat_messages_used);
      setChatMessagesLimit(data.chat_messages_limit);
      setCurrentPeriodEnd(data.current_period_end);
      setCancelAtPeriodEnd(data.cancel_at_period_end);
      setCompanion(typeof data.companion === "boolean" ? data.companion : null);
      setFreePeriodEnds(data.free_period_ends ?? null);

      if (session.user?.id) {
        identifyUser(session.user.id, { plan: data.plan });
      }
    } catch {
      // Best-effort — default to free tier
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubscription();
  }, [fetchSubscription]);

  // Refetch after checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      // Small delay for webhook to process
      const timer = setTimeout(() => void fetchSubscription(), 2000);
      return () => clearTimeout(timer);
    }
  }, [fetchSubscription]);

  const isSubscribed = plan !== "free" && (status === "active" || status === "trialing" || status === "past_due");
  const isPaid = companion ?? isSubscribed;
  const paymentPastDue = plan !== "free" && status === "past_due";
  const chatMessagesRemaining =
    chatMessagesLimit !== null ? Math.max(0, chatMessagesLimit - chatMessagesUsed) : null;

  return (
    <SubscriptionContext.Provider
      value={{
        plan,
        status,
        chatMessagesUsed,
        chatMessagesLimit,
        chatMessagesRemaining,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        isPaid,
        isSubscribed,
        freePeriodEnds,
        paymentPastDue,
        isLoading,
        refreshSubscription: fetchSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionState {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
