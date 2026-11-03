import type { SupabaseClient } from "@supabase/supabase-js";
import { describeSimilarBooks, findOrCreateBook, type FoundBook } from "./book-lookup.js";
import {
  fetchListEntries,
  findEntry,
  hasEntryFor,
  placeNewEntries,
  removeListBooks,
  reorderList,
} from "./list-items.js";

interface SeminarContent {
  pre_reading_context: string;
  focus_questions: string[];
  post_reading_prompts: string[];
}

interface PathBook {
  title: string;
  author?: string;
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
    | "get_seminar_content"
    | "update_seminar_content"
    | "reorder"
    | "remove_path_books"
    | "update_path"
    | "delete_path";
  path_name?: string;
  new_name?: string;
  thesis?: string;
  description?: string;
  books?: PathBook[];
  book_title?: string;
  progress?: "not_started" | "reading" | "completed";
  pre_reading_context?: string;
  focus_questions?: string[];
  post_reading_prompts?: string[];
  ordered_titles?: string[];
  position?: number;
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
        // Resolve each book — creates wishlist entries for books not in library
        const resolved: FoundBook[] = [];
        for (const book of command.books) {
          const result = await findOrCreateBook(supabase, book.title, book.author);
          resolved.push(result);
        }

        // Build items in original command order — every book gets a real book_id
        const items = command.books.map((book, i) => {
          const seminar =
            book.pre_reading_context || book.focus_questions || book.post_reading_prompts
              ? {
                  pre_reading_context: book.pre_reading_context ?? "",
                  focus_questions: book.focus_questions ?? [],
                  post_reading_prompts: book.post_reading_prompts ?? [],
                }
              : null;

          return {
            list_id: list.id,
            book_id: resolved[i].id,
            position: i + 1,
            path_progress: "not_started",
            seminar_content: seminar,
          };
        });

        const { error: insertError } = await supabase
          .from("list_items")
          .insert(items);

        if (insertError) throw insertError;

        const created = resolved.filter((b) => b.created).length;

        let msg = `Created reading path '${command.path_name}'`;
        if (command.thesis) {
          msg += ` with thesis: "${command.thesis}"`;
        }
        msg += ` — ${command.books.length} book${command.books.length === 1 ? "" : "s"} added`;
        if (created > 0) {
          msg += ` (${created} added to your library as wishlist item${created === 1 ? "" : "s"})`;
        }
        msg += ".";
        msg += describeSimilarBooks(resolved);
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

      const items = await fetchListEntries(supabase, path.id);

      if (items.length === 0) {
        return `'${path.name}' exists but has no items.`;
      }

      const completed = items.filter(
        (i) => i.path_progress === "completed",
      ).length;

      let header = `${path.name} (${completed}/${items.length} completed)`;
      if (path.thesis) header += `\nThesis: ${path.thesis}`;

      const lines = items.map((item) => {
        const progress = item.path_progress ?? "not_started";
        const statusIcon =
          progress === "completed"
            ? "[done]"
            : progress === "reading"
              ? "[reading]"
              : "[ ]";

        let line = `  ${item.position}. ${statusIcon} ${item.title} by ${item.author ?? "Unknown"}`;
        if (!item.book_id) line += " [not in library]";

        const seminar = item.seminar_content as SeminarContent | null;
        if (seminar?.pre_reading_context) {
          line += `\n     Context: ${seminar.pre_reading_context}`;
        }
        if (!seminar?.focus_questions?.length) {
          line += "\n     (no focus questions yet)";
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

      // Resolve each book — creates wishlist entries for books not in library
      const resolved: FoundBook[] = [];
      for (const book of command.books) {
        const result = await findOrCreateBook(supabase, book.title, book.author);
        resolved.push(result);
      }

      const entries = await fetchListEntries(supabase, path.id);
      const startPosition = entries.length + 1;

      const newIds: string[] = [];
      let alreadyInPath = 0;
      for (let i = 0; i < command.books.length; i++) {
        const book = command.books[i]!;
        // Includes entries kept after their book left the library
        if (hasEntryFor(entries, book.title, book.author)) {
          alreadyInPath++;
          continue;
        }

        const seminar =
          book.pre_reading_context || book.focus_questions || book.post_reading_prompts
            ? {
                pre_reading_context: book.pre_reading_context ?? "",
                focus_questions: book.focus_questions ?? [],
                post_reading_prompts: book.post_reading_prompts ?? [],
              }
            : null;

        const { data: inserted, error } = await supabase
          .from("list_items")
          .insert({
            list_id: path.id,
            book_id: resolved[i]!.id,
            position: startPosition + i,
            path_progress: "not_started",
            seminar_content: seminar,
          })
          .select("id")
          .single();

        if (error) {
          if (error.code === "23505") {
            alreadyInPath++;
            continue;
          }
          throw error;
        }
        newIds.push(inserted.id);
      }

      await placeNewEntries(supabase, path.id, newIds, command.position);

      const created = resolved.filter((b) => b.created).length;
      let msg = `Added ${newIds.length} book${newIds.length === 1 ? "" : "s"} to '${path.name}'.`;
      if (created > 0) {
        msg += ` ${created} added to your library as wishlist item${created === 1 ? "" : "s"}.`;
      }
      if (alreadyInPath > 0) {
        msg += ` ${alreadyInPath} already in the path.`;
      }
      return msg + describeSimilarBooks(resolved);
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

      const entries = await fetchListEntries(supabase, path.id);
      const target = findEntry(entries, command.book_title, path.name);

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

      return `Updated '${target.title}' to ${command.progress} in '${path.name}'.`;
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

      const entries = await fetchListEntries(supabase, path.id);
      const target = findEntry(entries, command.book_title, path.name);

      const seminar = target.seminar_content as SeminarContent | null;
      const bookTitle = target.title;
      const progress = target.path_progress ?? "not_started";

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

    case "update_seminar_content": {
      if (!command.path_name) {
        throw new Error("'update_seminar_content' requires path_name");
      }
      if (!command.book_title) {
        throw new Error("'update_seminar_content' requires book_title");
      }
      if (
        command.pre_reading_context === undefined &&
        command.focus_questions === undefined &&
        command.post_reading_prompts === undefined
      ) {
        throw new Error(
          "'update_seminar_content' requires pre_reading_context, focus_questions, or post_reading_prompts",
        );
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(`No reading path found matching '${command.path_name}'.`);
      }

      const entries = await fetchListEntries(supabase, path.id);
      const target = findEntry(entries, command.book_title, path.name);
      const current = target.seminar_content as SeminarContent | null;

      // Fields left out keep their current value
      const updated: SeminarContent = {
        pre_reading_context: command.pre_reading_context ?? current?.pre_reading_context ?? "",
        focus_questions: command.focus_questions ?? current?.focus_questions ?? [],
        post_reading_prompts: command.post_reading_prompts ?? current?.post_reading_prompts ?? [],
      };

      const { error } = await supabase
        .from("list_items")
        .update({ seminar_content: updated })
        .eq("id", target.id);

      if (error) throw error;

      return `Updated seminar content for '${target.title}' in '${path.name}'.`;
    }

    case "reorder": {
      if (!command.path_name) {
        throw new Error("'reorder' requires path_name");
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(`No reading path found matching '${command.path_name}'.`);
      }

      return reorderList(supabase, path.id, path.name, command);
    }

    case "remove_path_books": {
      if (!command.path_name) {
        throw new Error("'remove_path_books' requires path_name");
      }
      if (!command.books || command.books.length === 0) {
        throw new Error("'remove_path_books' requires at least one book");
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(`No reading path found matching '${command.path_name}'.`);
      }

      const { removed, notFound } = await removeListBooks(
        supabase,
        path.id,
        path.name,
        command.books.map((b) => b.title),
      );

      let msg = `Removed ${removed.length} book${removed.length === 1 ? "" : "s"} from '${path.name}'. They remain in the library.`;
      if (notFound.length > 0) {
        msg += ` Could not find: ${notFound.map((t) => `'${t}'`).join(", ")}.`;
      }
      return msg;
    }

    case "update_path": {
      if (!command.path_name) {
        throw new Error("'update_path' requires path_name");
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(`No reading path found matching '${command.path_name}'.`);
      }

      const fields = {
        ...(command.new_name && { name: command.new_name }),
        ...(command.thesis !== undefined && { thesis: command.thesis }),
        ...(command.description !== undefined && { description: command.description }),
      };
      if (Object.keys(fields).length === 0) {
        throw new Error("'update_path' requires new_name, thesis, or description");
      }

      if (command.new_name) {
        const clash = await findPathByName(supabase, command.new_name);
        if (clash && clash.id !== path.id) {
          throw new Error(`A reading path named '${clash.name}' already exists.`);
        }
      }

      const { error } = await supabase.from("lists").update(fields).eq("id", path.id);
      if (error) throw error;

      return `Updated reading path '${command.new_name ?? path.name}'.`;
    }

    case "delete_path": {
      if (!command.path_name) {
        throw new Error("'delete_path' requires path_name");
      }

      const path = await findPathByName(supabase, command.path_name);
      if (!path) {
        throw new Error(`No reading path found matching '${command.path_name}'.`);
      }

      const { error } = await supabase.from("lists").delete().eq("id", path.id);
      if (error) throw error;

      return `Deleted reading path '${path.name}'. Its books remain in the library.`;
    }

    default:
      throw new Error(
        `Unknown reading path action: ${(command as ReadingPathCommand).action}`,
      );
  }
}
