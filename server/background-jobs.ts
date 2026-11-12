import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startConversationReviewScheduler } from "./conversation-review.js";
import { startEmbeddingScheduler } from "./embeddings.js";
import { startEnrichmentScheduler } from "./enrichment-scheduler.js";
import { startProfileScheduler } from "./profile-scheduler.js";
import { startReleasesScheduler } from "./releases-scheduler.js";

/**
 * The schedulers for everything that runs in the background: profiles, enrichment and
 * tagging, conversation review, releases, and embeddings. In production they run in
 * the background worker (server/worker.ts), so a job can't slow or crash chat. Locally,
 * or before the worker exists, the chat server runs them itself; JOBS_IN_WORKER=true
 * on the web service turns that off.
 */
export function startBackgroundJobs(
  service: SupabaseClient,
  jobsAnthropic: Anthropic,
  reviewModel: string,
  { watchCurationRequests = false }: { watchCurationRequests?: boolean } = {},
): void {
  startProfileScheduler(service);
  startEnrichmentScheduler(service);
  startConversationReviewScheduler(service, jobsAnthropic, reviewModel);
  startReleasesScheduler(service, { watchCurationRequests });
  startEmbeddingScheduler(service);
}

/** Whether the web server leaves background jobs to the worker. */
export const jobsInWorker = () => process.env.JOBS_IN_WORKER === "true";
