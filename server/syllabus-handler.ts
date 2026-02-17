import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookByTitle, findOrCreateBook } from "./book-lookup.js";

interface SyllabusBook {
  title: string;
  author?: string;
}

export interface SyllabusCommand {
  action: "create" | "view" | "add_books" | "remove_books" | "delete";
  list_name?: string;
  description?: string;
  books?: SyllabusBook[] | string[];
  rationale?: string;
}

interface ResolvedBooks {
  found: { title: string; id: string; created: boolean }[];
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
  const found: { title: string; id: string; created: boolean }[] = [];

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
        return msg;
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

      const { found } = await resolveBooks(supabase, command.books);

      // Get current max position
      const { data: existing, error: fetchError } = await supabase
        .from("list_items")
        .select("position")
        .eq("list_id", list.id)
        .order("position", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      const startPosition = (existing?.[0]?.position ?? 0) + 1;

      let added = 0;
      for (let i = 0; i < found.length; i++) {
        const { error } = await supabase.from("list_items").insert({
          list_id: list.id,
          book_id: found[i].id,
          position: startPosition + i,
          rationale: command.rationale ?? null,
        });

        if (error) {
          // 23505 = unique violation (book already in syllabus) — skip silently
          if (error.code === "23505") continue;
          throw error;
        }
        added++;
      }

      const created = found.filter((b) => b.created).length;
      let msg = `Added ${added} book${added === 1 ? "" : "s"} to '${list.name}'.`;
      if (created > 0) {
        msg += ` ${created} added to your library as wishlist item${created === 1 ? "" : "s"}.`;
      }
      const skipped = found.length - added;
      if (skipped > 0) {
        msg += ` ${skipped} already in the syllabus.`;
      }
      return msg;
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

      // For removal, only look up existing books — don't create new ones
      const titles = normalizeBooksInput(command.books).map((b) => b.title);
      const foundBooks: { title: string; id: string }[] = [];
      const notFoundTitles: string[] = [];
      for (const title of titles) {
        const book = await findBookByTitle(supabase, title);
        if (book) {
          foundBooks.push({ title: book.title, id: book.id });
        } else {
          notFoundTitles.push(title);
        }
      }

      let removed = 0;
      for (const book of foundBooks) {
        const { error, count } = await supabase
          .from("list_items")
          .delete({ count: "exact" })
          .eq("list_id", list.id)
          .eq("book_id", book.id);

        if (error) throw error;
        if (count && count > 0) removed++;
      }

      // Renormalize positions
      const { data: remaining, error: fetchError } = await supabase
        .from("list_items")
        .select("id")
        .eq("list_id", list.id)
        .order("position");

      if (fetchError) throw fetchError;

      if (remaining && remaining.length > 0) {
        await Promise.all(
          remaining.map((item, i) =>
            supabase
              .from("list_items")
              .update({ position: i + 1 })
              .eq("id", item.id),
          ),
        );
      }

      let msg = `Removed ${removed} book${removed === 1 ? "" : "s"} from '${list.name}'.`;
      if (notFoundTitles.length > 0) {
        msg += ` Could not find: ${notFoundTitles.map((t) => `'${t}'`).join(", ")}.`;
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

    default:
      throw new Error(`Unknown syllabus action: ${(command as SyllabusCommand).action}`);
  }
}
