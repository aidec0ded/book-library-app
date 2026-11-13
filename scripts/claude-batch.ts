import type Anthropic from "@anthropic-ai/sdk";
import { recordClaudeUsage } from "../server/usage.js";

/**
 * Send many Claude requests through the Message Batches API, at half the price of
 * sending them one at a time. Used by the background jobs (tagging, predicted
 * ratings, release scoring), where nobody is waiting on the answer.
 *
 * Batches usually finish in minutes. If one is still running after `maxWaitMs`, it's
 * canceled: requests not yet processed aren't billed, the ones that finished are still
 * returned, and whatever didn't get done is picked up by the job's next run.
 */

export interface BatchRequest {
  customId: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
}

export interface BatchOptions {
  /** The api_usage feature each result's cost is recorded under. */
  feature: string;
  userId?: string | null;
  pollMs?: number;
  maxWaitMs?: number;
  log?: (line: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Submit the requests as one batch, wait for it, and call `onResult` with each
 * succeeded request's text. Returns how many succeeded and how many didn't (errored,
 * expired, canceled, or `onResult` threw).
 */
export async function runMessageBatch(
  anthropic: Anthropic,
  requests: BatchRequest[],
  onResult: (customId: string, text: string) => Promise<void>,
  { feature, userId = null, pollMs = 30_000, maxWaitMs = 60 * 60 * 1000, log = console.log }: BatchOptions,
): Promise<{ succeeded: number; failed: number }> {
  if (requests.length === 0) return { succeeded: 0, failed: 0 };

  const batch = await anthropic.messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.customId, params: r.params })),
  });
  log(`Batch ${batch.id} submitted (${requests.length} request${requests.length === 1 ? "" : "s"}). Waiting...`);

  const started = Date.now();
  let status = batch;
  let canceled = false;
  while (status.processing_status !== "ended") {
    await sleep(pollMs);
    status = await anthropic.messages.batches.retrieve(batch.id);
    const c = status.request_counts;
    log(`  ${c.succeeded} succeeded, ${c.errored} errored, ${c.processing} processing`);
    if (!canceled && status.processing_status === "in_progress" && Date.now() - started > maxWaitMs) {
      log(`  Still running after ${Math.round(maxWaitMs / 60000)} minutes; canceling the rest.`);
      await anthropic.messages.batches.cancel(batch.id);
      canceled = true;
    }
  }

  let succeeded = 0;
  let failed = 0;
  for await (const response of await anthropic.messages.batches.results(batch.id)) {
    if (response.result.type !== "succeeded") {
      log(`  ${response.custom_id}: ${response.result.type}`);
      failed++;
      continue;
    }
    const message = response.result.message;
    // Batch results don't pass through a tracked client; record them here at half price
    await recordClaudeUsage(feature, message.model, message.usage, { userId, batch: true });

    const text = message.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      log(`  ${response.custom_id}: no text in the response`);
      failed++;
      continue;
    }
    try {
      await onResult(response.custom_id, text.text);
      succeeded++;
    } catch (err) {
      log(`  ${response.custom_id}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }
  return { succeeded, failed };
}
