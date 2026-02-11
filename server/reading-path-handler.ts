import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookByTitle } from "./book-lookup.js";

interface SeminarContent {
  pre_reading_context: string;
  focus_questions: string[];
  post_reading_prompts: string[];
}

interface PathBook {
  title: string;
  pre_reading_context?: string;
  focus_questions?: string[];
  post_reading_prompts?: string[];
}

export interface ReadingPathCommand {
  action:
    | "create_path"
    | "view_path"
    | "add_path_books"
    | "update_progress"
    | "get_seminar_content";
  path_name?: string;
  thesis?: string;
  description?: string;
  books?: PathBook[];
  book_title?: string;
  progress?: "not_started" | "reading" | "completed";
}

interface ResolvedBook {
  title: string;
  id: string;
}

async function resolveBook(
  supabase: SupabaseClient,
  title: string,
): Promise<ResolvedBook | null> {
  const book = await findBookByTitle(supabase, title);
  return book ? { title: book.title, id: book.id } : null;
}


async function findPathByName(
  supabase: SupabaseClient,
  name: string,
): Promise<{ id: string; name: string; thesis: string | null } | null> {
  const { data, error } = await supabase
    .from("lists")
    .select("id, name, thesis")
    .eq("list_type", "reading_path")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function executeReadingPathCommand(
  supabase: SupabaseClient,
  command: ReadingPathCommand,
): Promise<string> {
  switch (command.action) {
    case "create_path": {
      if (!command.path_name) {
        throw new Error("'create_path' requires path_name");
      }

      const existing = await findPathByName(supabase, command.path_name);
      if (existing) {
        throw new Error(
          `A reading path named '${existing.name}' already exists. Use add_path_books to add books to it.`,
        );
      }

      const { data: list, error: createError } = await supabase
        .from("lists")
        .insert({
          name: command.path_name,
          description: command.description ?? null,
          list_type: "reading_path",
          thesis: command.thesis ?? null,
          ai_generated: true,
        })
        .select("id")
        .single();

      if (createError) throw createError;

      if (command.books && command.books.length > 0) {
        // Resolve each book, preserving original order
        const resolvedMap = new Map<string, ResolvedBook>();
        for (const book of command.books) {
          const result = await resolveBook(supabase, book.title);
          if (result) {
            resolvedMap.set(book.title.toLowerCase(), result);
          }
        }

        // Build items in original command order — library books get book_id,
        // unfound books become external items. All preserve seminar content.
        const items = command.books.map((book, i) => {
          const resolved = resolvedMap.get(book.title.toLowerCase());
          const seminar =
            book.pre_reading_context || book.focus_questions || book.post_reading_prompts
              ? {
                  pre_reading_context: book.pre_reading_context ?? "",
                  focus_questions: book.focus_questions ?? [],
                  post_reading_prompts: book.post_reading_prompts ?? [],
                }
              : null;

          if (resolved) {
            return {
              list_id: list.id,
              book_id: resolved.id,
              position: i + 1,
              path_progress: "not_started",
              seminar_content: seminar,
            };
          } else {
            return {
              list_id: list.id,
              book_id: null,
              position: i + 1,
              path_progress: "not_started",
              seminar_content: seminar,
              external_title: book.title,
              external_author: null,
            };
          }
        });

        const { error: insertError } = await supabase
          .from("list_items")
          .insert(items);

        if (insertError) throw insertError;

        const inLibrary = resolvedMap.size;
        const external = command.books.length - inLibrary;

        let msg = `Created reading path '${command.path_name}'`;
        if (command.thesis) {
          msg += ` with thesis: "${command.thesis}"`;
        }
        msg += ` — ${command.books.length} book${command.books.length === 1 ? "" : "s"} added`;
        if (external > 0) {
          msg += ` (${external} not yet in your library — they'll link automatically when you add them)`;
        }
        msg += ".";
        return msg;
      }

      let msg = `Created reading path '${command.path_name}'`;
      if (command.thesis) msg += ` with thesis: "${command.thesis}"`;
      msg += ".";
      return msg;
    }

    case "view_path": {
      if (!command.path_name) {
        // View all reading paths
        const { data: lists, error } = await supabase
          .from("lists")
          .select("id, name, thesis, description")
          .eq("list_type", "reading_path")
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!lists || lists.length === 0) {
          return "No reading paths exist yet.";
        }

        const { data: items, error: itemsError } = await supabase
          .from("list_items")
          .select("list_id, path_progress");

        if (itemsError) throw itemsError;

        // Build progress per list
        const progressMap = new Map<
          string,
          { total: number; completed: number; reading: number }
        >();
        for (const item of items ?? []) {
          const entry = progressMap.get(item.list_id) ?? {
            total: 0,
            completed: 0,
            reading: 0,
          };
          entry.total++;
          if (item.path_progress === "completed") entry.completed++;
          if (item.path_progress === "reading") entry.reading++;
          progressMap.set(item.list_id, entry);
        }

        const lines = lists.map((list) => {
          const p = progressMap.get(list.id as string) ?? {
            total: 0,
            completed: 0,
            reading: 0,
          };
          let line = `- ${list.name} (${p.completed}/${p.total} completed)`;
          if (list.thesis) line += `: ${list.thesis}`;
          return line;
        });

        return `Your reading paths:\n${lines.join("\n")}`;
      }

      // View a specific path
      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        return `No reading path found matching '${command.path_name}'.`;
      }

      const { data: items, error } = await supabase
        .from("list_items")
        .select(
          "position, path_progress, seminar_content, book_id, external_title, external_author, book:books(title, author)",
        )
        .eq("list_id", path.id)
        .order("position");

      if (error) throw error;

      if (!items || items.length === 0) {
        return `'${path.name}' exists but has no items.`;
      }

      const completed = items.filter(
        (i) => i.path_progress === "completed",
      ).length;

      let header = `${path.name} (${completed}/${items.length} completed)`;
      if (path.thesis) header += `\nThesis: ${path.thesis}`;

      const lines = items.map((item) => {
        let title: string;
        let author: string;
        if (item.book_id) {
          const book = item.book as unknown as {
            title: string;
            author: string;
          };
          title = book.title;
          author = book.author;
        } else {
          title = (item.external_title as string) ?? "Untitled";
          author = (item.external_author as string) ?? "Unknown";
        }

        const progress = (item.path_progress as string) ?? "not_started";
        const statusIcon =
          progress === "completed"
            ? "[done]"
            : progress === "reading"
              ? "[reading]"
              : "[ ]";

        let line = `  ${item.position}. ${statusIcon} ${title} by ${author}`;

        const seminar = item.seminar_content as SeminarContent | null;
        if (seminar?.pre_reading_context) {
          line += `\n     Context: ${seminar.pre_reading_context}`;
        }

        return line;
      });

      return `${header}\n${lines.join("\n")}`;
    }

    case "add_path_books": {
      if (!command.path_name) {
        throw new Error("'add_path_books' requires path_name");
      }
      if (!command.books || command.books.length === 0) {
        throw new Error("'add_path_books' requires at least one book");
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(
          `No reading path found matching '${command.path_name}'.`,
        );
      }

      // Resolve each book
      const resolvedMap = new Map<string, ResolvedBook>();
      for (const book of command.books) {
        const result = await resolveBook(supabase, book.title);
        if (result) {
          resolvedMap.set(book.title.toLowerCase(), result);
        }
      }

      // Get current max position
      const { data: existing, error: fetchError } = await supabase
        .from("list_items")
        .select("position")
        .eq("list_id", path.id)
        .order("position", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;
      const startPosition = (existing?.[0]?.position ?? 0) + 1;

      let added = 0;
      for (let i = 0; i < command.books.length; i++) {
        const book = command.books[i];
        const resolved = resolvedMap.get(book.title.toLowerCase());
        const seminar =
          book.pre_reading_context || book.focus_questions || book.post_reading_prompts
            ? {
                pre_reading_context: book.pre_reading_context ?? "",
                focus_questions: book.focus_questions ?? [],
                post_reading_prompts: book.post_reading_prompts ?? [],
              }
            : null;

        const item: Record<string, unknown> = {
          list_id: path.id,
          position: startPosition + i,
          path_progress: "not_started",
          seminar_content: seminar,
        };

        if (resolved) {
          item.book_id = resolved.id;
        } else {
          item.book_id = null;
          item.external_title = book.title;
          item.external_author = null;
        }

        const { error } = await supabase.from("list_items").insert(item);

        if (error) {
          if (error.code === "23505") continue; // duplicate
          throw error;
        }
        added++;
      }

      const external = command.books.length - resolvedMap.size;
      let msg = `Added ${added} book${added === 1 ? "" : "s"} to '${path.name}'.`;
      if (external > 0) {
        msg += ` ${external} not yet in your library — they'll link automatically when you add them.`;
      }
      return msg;
    }

    case "update_progress": {
      if (!command.path_name) {
        throw new Error("'update_progress' requires path_name");
      }
      if (!command.book_title) {
        throw new Error("'update_progress' requires book_title");
      }
      if (!command.progress) {
        throw new Error("'update_progress' requires progress");
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(
          `No reading path found matching '${command.path_name}'.`,
        );
      }

      // Find the item by book title
      const { data: items, error: itemsError } = await supabase
        .from("list_items")
        .select("id, book_id, book:books(title)")
        .eq("list_id", path.id);

      if (itemsError) throw itemsError;

      const target = (items ?? []).find((item) => {
        if (!item.book_id) return false;
        const book = item.book as unknown as { title: string };
        return book.title.toLowerCase() === command.book_title!.toLowerCase();
      });

      if (!target) {
        throw new Error(
          `No book matching '${command.book_title}' found in path '${path.name}'.`,
        );
      }

      const { error: updateError } = await supabase
        .from("list_items")
        .update({ path_progress: command.progress })
        .eq("id", target.id);

      if (updateError) throw updateError;

      // If completed, sync book status
      if (command.progress === "completed" && target.book_id) {
        const { data: book } = await supabase
          .from("books")
          .select("status")
          .eq("id", target.book_id)
          .single();

        if (book && book.status !== "read") {
          await supabase
            .from("books")
            .update({ status: "read" })
            .eq("id", target.book_id);
        }
      }

      const bookTitle = (
        target.book as unknown as { title: string }
      ).title;
      return `Updated '${bookTitle}' to ${command.progress} in '${path.name}'.`;
    }

    case "get_seminar_content": {
      if (!command.path_name) {
        throw new Error("'get_seminar_content' requires path_name");
      }
      if (!command.book_title) {
        throw new Error("'get_seminar_content' requires book_title");
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(
          `No reading path found matching '${command.path_name}'.`,
        );
      }

      const { data: items, error: itemsError } = await supabase
        .from("list_items")
        .select("seminar_content, path_progress, book_id, book:books(title)")
        .eq("list_id", path.id);

      if (itemsError) throw itemsError;

      const target = (items ?? []).find((item) => {
        if (!item.book_id) return false;
        const book = item.book as unknown as { title: string };
        return book.title.toLowerCase() === command.book_title!.toLowerCase();
      });

      if (!target) {
        throw new Error(
          `No book matching '${command.book_title}' found in path '${path.name}'.`,
        );
      }

      const seminar = target.seminar_content as SeminarContent | null;
      const bookTitle = (
        target.book as unknown as { title: string }
      ).title;
      const progress = (target.path_progress as string) ?? "not_started";

      if (!seminar) {
        return `'${bookTitle}' in '${path.name}' has no seminar content yet. Progress: ${progress}.`;
      }

      let result = `Seminar content for '${bookTitle}' in '${path.name}' (${progress}):`;
      if (seminar.pre_reading_context) {
        result += `\n\nContext: ${seminar.pre_reading_context}`;
      }
      if (seminar.focus_questions.length > 0) {
        result += `\n\nFocus Questions:\n${seminar.focus_questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
      }
      if (seminar.post_reading_prompts.length > 0) {
        result += `\n\nAfter Reading:\n${seminar.post_reading_prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
      }

      return result;
    }

    default:
      throw new Error(
        `Unknown reading path action: ${(command as ReadingPathCommand).action}`,
      );
  }
}
