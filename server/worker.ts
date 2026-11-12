import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { startAlerts } from "./alerts.js";
import { startBackgroundJobs } from "./background-jobs.js";
import { startCostReconciliation } from "./cost-reconciliation.js";
import { startHealthReports } from "./health.js";
import { CHAT_MODEL } from "./models.js";
import { startStripeReconciliation } from "./stripe-reconciliation.js";

/**
 * The background worker: a separate Render service (Background Worker type) that runs
 * every scheduler and the scripts they start, so imports, profiles, and scoring can't
 * slow or crash chat. Start command: npx tsx server/worker.ts. It needs the same
 * environment variables as the web service. Set JOBS_IN_WORKER=true on the web service
 * first, so the two never run jobs at the same time.
 */

config();

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const jobsAnthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_JOBS_API_KEY ?? process.env.ANTHROPIC_API_KEY!,
});

console.log("[worker] Starting background jobs.");
// The web server can't start a releases job here directly, so curation requests are polled
startBackgroundJobs(service, jobsAnthropic, CHAT_MODEL, { watchCurationRequests: true });
// Only the worker sends alerts and checks costs against Anthropic, so a local server never emails
startAlerts(service);
startCostReconciliation(service);
startStripeReconciliation(service);
startHealthReports(service, "worker");

process.on("SIGTERM", () => {
  console.log("[worker] Stopping.");
  process.exit(0);
});
