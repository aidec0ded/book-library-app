import type { SupabaseClient } from "@supabase/supabase-js";

interface CacheEntry {
  data: string | null;
  cachedAt: number;
}

interface SeminarContent {
  pre_reading_context: string;
  focus_questions: string[];
  post_reading_prompts: string[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function buildSyllabusIndex(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const entry = cache.get(userId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
    return entry.data;
  }

  const { data: lists, error: listsError } = await supabase
    .from("lists")
    .select("id, name, description, list_type, thesis")
    .order("created_at", { ascending: false });

  if (listsError) throw listsError;

  if (!lists || lists.length === 0) {
    cache.set(userId, { data: null, cachedAt: Date.now() });
    return null;
  }

  // Fetch all list items with joined book data
  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("list_id, position, rationale, path_progress, seminar_content, book_id, external_title, external_author, book:books(title, author)")
    .order("position");

  if (itemsError) throw itemsError;

  interface ParsedItem {
    position: number;
    title: string;
    author: string;
    rationale: string | null;
    isExternal: boolean;
    pathProgress: string | null;
    seminarContent: SeminarContent | null;
  }

  // Group items by list
  const itemsByList = new Map<string, ParsedItem[]>();
  for (const item of items ?? []) {
    let title: string;
    let author: string;
    let isExternal = false;

    if (item.book_id) {
      const book = item.book as unknown as { title: string; author: string };
      if (!book) continue;
      title = book.title;
      author = book.author;
    } else {
      title = (item.external_title as string) ?? "Untitled";
      author = (item.external_author as string) ?? "Unknown";
      isExternal = true;
    }

    const list = itemsByList.get(item.list_id) ?? [];
    list.push({
      position: item.position as number,
      title,
      author,
      rationale: item.rationale as string | null,
      isExternal,
      pathProgress: item.path_progress as string | null,
      seminarContent: item.seminar_content as SeminarContent | null,
    });
    itemsByList.set(item.list_id, list);
  }

  const syllabi = lists.filter((l) => l.list_type !== "reading_path");
  const paths = lists.filter((l) => l.list_type === "reading_path");

  const sections: string[] = [];

  // Syllabi section
  if (syllabi.length > 0) {
    sections.push("### Your Syllabi");

    for (const list of syllabi) {
      const listItems = itemsByList.get(list.id as string) ?? [];
      let header = `\n${list.name} (${listItems.length} item${listItems.length === 1 ? "" : "s"})`;
      if (list.description) header += `: ${list.description}`;
      sections.push(header);

      for (const item of listItems) {
        let line = `  ${item.position}. ${item.title} by ${item.author}`;
        if (item.isExternal) line += " [not in library]";
        if (item.rationale) line += ` — ${item.rationale}`;
        sections.push(line);
      }
    }
  }

  // Reading paths section
  if (paths.length > 0) {
    sections.push("\n### Your Reading Paths");

    for (const path of paths) {
      const listItems = itemsByList.get(path.id as string) ?? [];
      const completed = listItems.filter((i) => i.pathProgress === "completed").length;

      let header = `\n${path.name} (${completed}/${listItems.length} completed)`;
      if (path.thesis) header += `\nThesis: ${path.thesis}`;
      sections.push(header);

      // Find current book: first 'reading', or first 'not_started'
      const currentBook =
        listItems.find((i) => i.pathProgress === "reading") ??
        listItems.find((i) => i.pathProgress === "not_started");

      for (const item of listItems) {
        const isCurrent = item === currentBook;
        const progressIcon =
          item.pathProgress === "completed"
            ? "[done]"
            : item.pathProgress === "reading"
              ? "[reading]"
              : "[ ]";

        let line = `  ${item.position}. ${progressIcon} ${item.title} by ${item.author}`;
        if (item.isExternal) line += " [not in library]";

        // Show focus questions for the current book inline
        if (isCurrent && item.seminarContent?.focus_questions?.length) {
          line += "\n     Focus questions:";
          for (const q of item.seminarContent.focus_questions) {
            line += `\n       - ${q}`;
          }
        }

        sections.push(line);
      }
    }
  }

  if (sections.length === 0) {
    cache.set(userId, { data: null, cachedAt: Date.now() });
    return null;
  }

  const index = sections.join("\n");
  cache.set(userId, { data: index, cachedAt: Date.now() });
  return index;
}
