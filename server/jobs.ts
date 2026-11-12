import { exec, type ExecException } from "node:child_process";
import { recordJobRun } from "./usage.js";

/**
 * Background scripts (tagging, predictions, profiles, releases) each run as their own
 * `npx tsx` process of about 80-100MB, beside a server of about 130MB on a 512MB
 * instance. The schedulers start them independently, so this caps how many run at
 * once across all of them; the rest wait their turn.
 */
const MAX_RUNNING_SCRIPTS = 2;

let running = 0;
const waiting: (() => void)[] = [];

type Done = (error: ExecException | null, stdout: string, stderr: string) => void;

export function runScript(command: string, done: Done): void {
  const start = () => {
    running++;
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
      running--;
      waiting.shift()?.();
      // Heartbeat under the script's name, e.g. "enrich-isbndb"
      const script = command.match(/scripts\/([\w-]+)\.ts/)?.[1] ?? command;
      void recordJobRun(script, { ok: !error, error: error ? (stderr || error.message).slice(-1000) : undefined });
      done(error, stdout, stderr);
    });
  };
  if (running < MAX_RUNNING_SCRIPTS) start();
  else {
    console.log(`[jobs] ${running} scripts running; queued: ${command}`);
    waiting.push(start);
  }
}
