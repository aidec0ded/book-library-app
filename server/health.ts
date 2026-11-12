import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Each server reports its memory to service_health (migration 036) every 5 minutes,
 * for the telemetry page and the memory alert. The figure is the whole container's,
 * read from its cgroup, so scripts a server starts are counted too; page cache the
 * kernel can drop (inactive files) is left out, as `docker stats` does. Today's peak
 * comes from a sample every 30 seconds. Only on Render (RENDER is set there), so a
 * local server never overwrites production's row.
 */

const SAMPLE_MS = 30_000;
const REPORT_MS = 5 * 60 * 1000;
const MB = 1024 * 1024;

function readNumber(path: string): number | null {
  try {
    const text = readFileSync(path, "utf8").trim();
    if (text === "max") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function statValue(path: string, key: string): number {
  try {
    const line = readFileSync(path, "utf8").split("\n").find((l) => l.startsWith(`${key} `));
    return line ? Number(line.split(" ")[1]) || 0 : 0;
  } catch {
    return 0;
  }
}

/** The container's memory in use and its limit, in bytes; the process alone if there's no cgroup. */
export function containerMemory(): { used: number; limit: number | null } {
  // cgroup v2
  const v2 = readNumber("/sys/fs/cgroup/memory.current");
  if (v2 !== null) {
    const used = v2 - statValue("/sys/fs/cgroup/memory.stat", "inactive_file");
    return { used, limit: readNumber("/sys/fs/cgroup/memory.max") };
  }
  // cgroup v1
  const v1 = readNumber("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  if (v1 !== null) {
    const used = v1 - statValue("/sys/fs/cgroup/memory/memory.stat", "total_inactive_file");
    const limit = readNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
    // v1 reports a huge number when there's no limit
    return { used, limit: limit !== null && limit < 2 ** 50 ? limit : null };
  }
  return { used: process.memoryUsage().rss, limit: null };
}

const round = (bytes: number) => Math.round((bytes / MB) * 10) / 10;
const utcDay = () => new Date().toISOString().slice(0, 10);

export function startHealthReports(service: SupabaseClient, name: "web" | "worker"): void {
  if (!process.env.RENDER) return;
  const startedAt = new Date().toISOString();
  let peak = 0;
  let peakDay = utcDay();
  let seeded = false;

  const sample = () => {
    if (utcDay() !== peakDay) {
      peak = 0;
      peakDay = utcDay();
    }
    peak = Math.max(peak, containerMemory().used);
  };

  const report = async () => {
    try {
      sample();
      // After a restart, keep the peak already reported today
      if (!seeded) {
        seeded = true;
        const { data } = await service.from("service_health").select("peak_mb, peak_day").eq("service", name).maybeSingle();
        if (data && data.peak_day === peakDay) peak = Math.max(peak, Number(data.peak_mb) * MB);
      }
      const { used, limit } = containerMemory();
      const { error } = await service.from("service_health").upsert(
        {
          service: name,
          memory_mb: round(used),
          limit_mb: limit ? round(limit) : null,
          process_mb: round(process.memoryUsage().rss),
          peak_mb: round(peak),
          peak_day: peakDay,
          started_at: startedAt,
          reported_at: new Date().toISOString(),
        },
        { onConflict: "service" },
      );
      if (error) throw error;
    } catch (err) {
      console.error("[health] Couldn't report memory:", err instanceof Error ? err.message : err);
    }
  };

  setInterval(sample, SAMPLE_MS).unref();
  setInterval(() => void report(), REPORT_MS).unref();
  setTimeout(() => void report(), 20_000).unref();
}
