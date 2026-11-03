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

interface SyllabusBook {
  title: string;
  author?: string;
}

export interface SyllabusCommand {
  action:
    | "create"
    | "view"
    | "add_books"
    | "remove_books"
    | "delete"
    | "reorder"
    | "update_rationale"
    | "update_syllabus";
  list_name?: string;
  new_name?: string;
  description?: string;
  books?: SyllabusBook[] | string[];
  rationale?: string;
  book_title?: string;
  ordered_titles?: string[];
  position?: number;
}

interface ResolvedBooks {
  found: FoundBook[];
}

/** Normalize mixed input — tool may send strings or objects */
function normalizeBooksInput(books: SyllabusBook[] | string[]): SyllabusBook[] {
  return books.map((b) => (typeof b === "string" ? { title: b } : b));
}

async function resolveBooks(
  supabase: SupabaseClient,
  rawBooks: SyllabusBook[] | string[],
): Promise<ResolvedBooks> {
  const books = normalizeBooksInput(rawBooks);
  const found: FoundBook[] = [];

  for (const book of books) {
    const result = await findOrCreateBook(supabase, book.title, book.author);
    found.push(result);
  }

  return { found };
}

async function findSyllabusByName(
  supabase: SupabaseClient,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("lists")
    .select("id, name")
    .eq("list_type", "syllabus")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function executeSyllabusCommand(
  supabase: SupabaseClient,
  command: SyllabusCommand,
): Promise<string> {
  switch (command.action) {
    case "create": {
      if (!command.list_name) {
        throw new Error("'create' requires list_name");
      }

      // Check for duplicate name
      const existing = await findSyllabusByName(supabase, command.list_name);
      if (existing) {
        throw new Error(
          `A syllabus named '${existing.name}' already exists. Use add_books to add books to it.`,
        );
      }

      // Create the syllabus
      const { data: list, error: createError } = await supabase
        .from("lists")
        .insert({
          name: command.list_name,
          description: command.description ?? null,
          list_type: "syllabus",
          ai_generated: true,
        })
        .select("id")
        .single();

      if (createError) throw createError;

      // Add books if provided
      if (command.books && command.books.length > 0) {
        const { found } = await resolveBooks(supabase, command.books);

        if (found.length > 0) {
          const items = found.map((book, i) => ({
            list_id: list.id,
            book_id: book.id,
            position: i + 1,
            rationale: command.rationale ?? null,
          }));

          const { error: insertError } = await supabase
            .from("list_items")
            .insert(items);

          if (insertError) throw insertError;
        }

        const created = found.filter((b) => b.created).length;
        let msg = `Created syllabus '${command.list_name}' with ${found.length} book${found.length === 1 ? "" : "s"}.`;
        if (created > 0) {
          msg += ` ${created} added to your library as wishlist item${created === 1 ? "" : "s"}.`;
        }
        return msg + describeSimilarBooks(found);
      }

      return `Created syllabus '${command.list_name}'.`;
    }

    case "view": {
      if (!command.list_name) {
        // View all syllabi
        const { data: lists, error } = await supabase
          .from("lists")
          .select("id, name, description")
          .eq("list_type", "syllabus")
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!lists || lists.length === 0) {
          return "No syllabi exist yet.";
        }

        // Get item counts
        const { data: items, error: itemsError } = await supabase
          .from("list_items")
          .select("list_id");

        if (itemsError) throw itemsError;

        const counts = new Map<string, number>();
        for (const item of items ?? []) {
          counts.set(item.list_id, (counts.get(item.list_id) ?? 0) + 1);
        }

        const lines = lists.map((list) => {
          const count = counts.get(list.id as string) ?? 0;
          let line = `- ${list.name} (${count} book${count === 1 ? "" : "s"})`;
          if (list.description) line += `: ${list.description}`;
          return line;
        });

        return `Your syllabi:\n${lines.join("\n")}`;
      }

      // View a specific syllabus
      const list = await findSyllabusByName(supabase, command.list_name);
      if (!list) {
        return `No syllabus found matching '${command.list_name}'.`;
      }

      const { data: items, error } = await supabase
        .from("list_items")
        .select("position, rationale, book_id, external_title, external_author, book:books(title, author)")
        .eq("list_id", list.id)
        .order("position");

      if (error) throw error;

      if (!items || items.length === 0) {
        return `'${list.name}' exists but has no items.`;
      }

      const lines = items.map((item) => {
        let line: string;
        if (item.book_id) {
          const book = item.book as unknown as { title: string; author: string };
          line = `${item.position}. ${book.title} by ${book.author}`;
        } else {
          line = `${item.position}. ${item.external_title} by ${item.external_author ?? "Unknown"} [not in library]`;
        }
        if (item.rationale) {
          line += ` — ${item.rationale}`;
        }
        return line;
      });

      return `${list.name} (${items.length} item${items.length === 1 ? "" : "s"}):\n${lines.join("\n")}`;
    }

    case "add_books": {
      if (!command.list_name) {
        throw new Error("'add_books' requires list_name");
      }
      if (!command.books || command.books.length === 0) {
        throw new Error("'add_books' requires at least one book title");
      }

      const list = await findSyllabusByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No syllabus found matching '${command.list_name}'.`);
      }

      const requested = normalizeBooksInput(command.books);
      const { found } = await resolveBooks(supabase, requested);
      const entries = await fetchListEntries(supabase, list.id);

      const newIds: string[] = [];
      let skipped = 0;
      for (let i = 0; i < found.length; i++) {
        const book = requested[i]!;
        // Includes entries kept after their book left the library
        if (hasEntryFor(entries, book.title, book.author)) {
          skipped++;
          continue;
        }

        const { data: inserted, error } = await supabase
          .from("list_items")
          .insert({
            list_id: list.id,
            book_id: found[i]!.id,
            position: entries.length + 1 + i,
            rationale: command.rationale ?? null,
          })
          .select("id")
          .single();

        if (error) {
          // 23505 = unique violation (book already in syllabus) — skip silently
          if (error.code === "23505") {
            skipped++;
            continue;
          }
          throw error;
        }
        newIds.push(inserted.id);
      }

      await placeNewEntries(supabase, list.id, newIds, command.position);

      const created = found.filter((b) => b.created).length;
      let msg = `Added ${newIds.length} book${newIds.length === 1 ? "" : "s"} to '${list.name}'.`;
      if (created > 0) {
        msg += ` ${created} added to your library as wishlist item${created === 1 ? "" : "s"}.`;
      }
      if (skipped > 0) {
        msg += ` ${skipped} already in the syllabus.`;
      }
      return msg + describeSimilarBooks(found);
    }

    case "remove_books": {
      if (!command.list_name) {
        throw new Error("'remove_books' requires list_name");
      }
      if (!command.books || command.books.length === 0) {
        throw new Error("'remove_books' requires at least one book title");
      }

      const list = await findSyllabusByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No syllabus found matching '${command.list_name}'.`);
      }

      const { removed, notFound } = await removeListBooks(
        supabase,
        list.id,
        list.name,
        normalizeBooksInput(command.books).map((b) => b.title),
      );

      let msg = `Removed ${removed.length} book${removed.length === 1 ? "" : "s"} from '${list.name}'.`;
      if (notFound.length > 0) {
        msg += ` Could not find: ${notFound.map((t) => `'${t}'`).join(", ")}.`;
      }
      return msg;
    }

    case "delete": {
      if (!command.list_name) {
        throw new Error("'delete' requires list_name");
      }

      const list = await findSyllabusByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No syllabus found matching '${command.list_name}'.`);
      }

      const { error } = await supabase
        .from("lists")
        .delete()
        .eq("id", list.id);

      if (error) throw error;

      return `Deleted syllabus '${list.name}'.`;
    }

    case "reorder": {
      if (!command.list_name) {
        throw new Error("'reorder' requires list_name");
      }

      const list = await findSyllabusByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No syllabus found matching '${command.list_name}'.`);
      }

      return reorderList(supabase, list.id, list.name, command);
    }

    case "update_rationale": {
      if (!command.list_name) {
        throw new Error("'update_rationale' requires list_name");
      }
      if (!command.book_title) {
        throw new Error("'update_rationale' requires book_title");
      }
      if (command.rationale === undefined) {
        throw new Error("'update_rationale' requires rationale");
      }

      const list = await findSyllabusByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No syllabus found matching '${command.list_name}'.`);
      }

      const entries = await fetchListEntries(supabase, list.id);
      const target = findEntry(entries, command.book_title, list.name);

      const { error } = await supabase
        .from("list_items")
        .update({ rationale: command.rationale || null })
        .eq("id", target.id);

      if (error) throw error;

      return `Updated the rationale for '${target.title}' in '${list.name}'.`;
    }

    case "update_syllabus": {
      if (!command.list_name) {
        throw new Error("'update_syllabus' requires list_name");
      }

      const list = await findSyllabusByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No syllabus found matching '${command.list_name}'.`);
      }

      const fields = {
        ...(command.new_name && { name: command.new_name }),
        ...(command.description !== undefined && { description: command.description }),
      };
      if (Object.keys(fields).length === 0) {
        throw new Error("'update_syllabus' requires new_name or description");
      }

      if (command.new_name) {
        const clash = await findSyllabusByName(supabase, command.new_name);
        if (clash && clash.id !== list.id) {
          throw new Error(`A syllabus named '${clash.name}' already exists.`);
        }
      }

      const { error } = await supabase.from("lists").update(fields).eq("id", list.id);
      if (error) throw error;

      return `Updated syllabus '${command.new_name ?? list.name}'.`;
    }

    default:
      throw new Error(`Unknown syllabus action: ${(command as SyllabusCommand).action}`);
  }
}
