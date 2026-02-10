import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReleasesCommand {
  action: "browse" | "top" | "search";
  month?: string;
  query?: string;
  limit?: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonth(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function parseMonth(monthStr: string): { year: number; month: number } | null {
  // Accept "2026-02" or "February 2026" or "Feb 2026"
  const dashMatch = monthStr.match(/^(\d{4})-(\d{1,2})$/);
  if (dashMatch) {
    const year = parseInt(dashMatch[1], 10);
    const month = parseInt(dashMatch[2], 10);
    if (month >= 1 && month <= 12) return { year, month };
  }

  const nameMatch = monthStr.match(/^(\w+)\s+(\d{4})$/i);
  if (nameMatch) {
    const idx = MONTH_NAMES.findIndex(
      (m) => m.toLowerCase().startsWith(nameMatch[1].toLowerCase()),
    );
    if (idx !== -1) {
      return { year: parseInt(nameMatch[2], 10), month: idx + 1 };
    }
  }

  return null;
}

function formatRelease(r: {
  title: string;
  authors: string[];
  general_signal_score: number | null;
  publisher: string | null;
  date_published: string | null;
}): string {
  const parts = [`- ${r.title} by ${r.authors.join(", ") || "Unknown"}`];
  if (r.general_signal_score != null) parts.push(`  Score: ${r.general_signal_score}/10`);
  if (r.publisher) parts.push(`  Publisher: ${r.publisher}`);
  return parts.join("\n");
}

export async function executeReleasesCommand(
  supabase: SupabaseClient,
  command: ReleasesCommand,
): Promise<string> {
  const resultLimit = Math.min(command.limit ?? 10, 20);

  switch (command.action) {
    case "browse": {
      // Default to current month
      let year: number;
      let month: number;

      if (command.month) {
        const parsed = parseMonth(command.month);
        if (!parsed) {
          return `Could not parse month '${command.month}'. Use format 'YYYY-MM' or 'Month Year'.`;
        }
        year = parsed.year;
        month = parsed.month;
      } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      }

      const { data, error, count } = await supabase
        .from("new_releases")
        .select("title, authors, general_signal_score, publisher, date_published", { count: "exact" })
        .eq("pub_year", year)
        .eq("pub_month", month)
        .order("general_signal_score", { ascending: false, nullsFirst: false })
        .order("title")
        .limit(resultLimit);

      if (error) throw error;
      if (!data || data.length === 0) {
        return `No releases found for ${formatMonth(year, month)}.`;
      }

      const lines = data.map(formatRelease);
      return `New releases for ${formatMonth(year, month)} (${data.length} of ${count ?? data.length}):\n\n${lines.join("\n\n")}`;
    }

    case "top": {
      // Top scored releases across all months
      let year: number | null = null;
      let month: number | null = null;

      if (command.month) {
        const parsed = parseMonth(command.month);
        if (parsed) {
          year = parsed.year;
          month = parsed.month;
        }
      }

      let query = supabase
        .from("new_releases")
        .select("title, authors, general_signal_score, publisher, date_published")
        .gte("general_signal_score", 7)
        .order("general_signal_score", { ascending: false, nullsFirst: false })
        .limit(resultLimit);

      if (year != null && month != null) {
        query = query.eq("pub_year", year).eq("pub_month", month);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (!data || data.length === 0) {
        const scope = year && month ? ` for ${formatMonth(year, month)}` : "";
        return `No top-scored releases found${scope}.`;
      }

      const lines = data.map(formatRelease);
      const scope = year && month ? ` for ${formatMonth(year, month)}` : "";
      return `Top recommended releases${scope} (score >= 7):\n\n${lines.join("\n\n")}`;
    }

    case "search": {
      if (!command.query) {
        throw new Error("'search' requires a query");
      }

      // Search by title or author
      const q = command.query;
      const { data, error } = await supabase
        .from("new_releases")
        .select("title, authors, general_signal_score, publisher, date_published, pub_year, pub_month")
        .or(`title.ilike.%${q}%,authors.cs.{"${q}"}`)
        .order("general_signal_score", { ascending: false, nullsFirst: false })
        .limit(resultLimit);

      if (error) throw error;
      if (!data || data.length === 0) {
        return `No releases found matching '${q}'.`;
      }

      const lines = data.map((r) => {
        const monthLabel = r.pub_year && r.pub_month ? ` (${formatMonth(r.pub_year, r.pub_month)})` : "";
        return formatRelease(r) + monthLabel;
      });

      return `Releases matching '${q}' (${data.length} result${data.length !== 1 ? "s" : ""}):\n\n${lines.join("\n\n")}`;
    }

    default:
      throw new Error(
        `Unknown releases action: ${(command as ReleasesCommand).action}`,
      );
  }
}
