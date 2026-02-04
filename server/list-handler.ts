import type { SupabaseClient } from "@supabase/supabase-js";

export interface ListCommand {
  action: "create" | "view" | "add_books" | "remove_books" | "delete";
  list_name?: string;
  description?: string;
  books?: string[];
}

interface ResolvedBooks {
  found: { title: string; id: string }[];
  notFound: string[];
}

async function resolveBooks(
  supabase: SupabaseClient,
  titles: string[],
): Promise<ResolvedBooks> {
  const found: { title: string; id: string }[] = [];
  const notFound: string[] = [];

  for (const title of titles) {
    const { data, error } = await supabase
      .from("books")
      .select("id, title")
      .ilike("title", title)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      found.push({ title: data.title as string, id: data.id as string });
    } else {
      notFound.push(title);
    }
  }

  return { found, notFound };
}

async function findListByName(
  supabase: SupabaseClient,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("lists")
    .select("id, name")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function executeListCommand(
  supabase: SupabaseClient,
  command: ListCommand,
): Promise<string> {
  switch (command.action) {
    case "create": {
      if (!command.list_name) {
        throw new Error("'create' requires list_name");
      }

      // Check for duplicate name
      const existing = await findListByName(supabase, command.list_name);
      if (existing) {
        throw new Error(
          `A list named '${existing.name}' already exists. Use add_books to add books to it.`,
        );
      }

      // Create the list
      const { data: list, error: createError } = await supabase
        .from("lists")
        .insert({
          name: command.list_name,
          description: command.description ?? null,
        })
        .select("id")
        .single();

      if (createError) throw createError;

      // Add books if provided
      if (command.books && command.books.length > 0) {
        const { found, notFound } = await resolveBooks(supabase, command.books);

        if (found.length > 0) {
          const items = found.map((book, i) => ({
            list_id: list.id,
            book_id: book.id,
            position: i + 1,
          }));

          const { error: insertError } = await supabase
            .from("list_items")
            .insert(items);

          if (insertError) throw insertError;
        }

        let msg = `Created list '${command.list_name}'`;
        if (found.length > 0) {
          msg += ` with ${found.length} book${found.length === 1 ? "" : "s"}.`;
        } else {
          msg += ".";
        }
        if (notFound.length > 0) {
          msg += ` Could not find: ${notFound.map((t) => `'${t}'`).join(", ")}.`;
        }
        return msg;
      }

      return `Created list '${command.list_name}'.`;
    }

    case "view": {
      if (!command.list_name) {
        // View all lists
        const { data: lists, error } = await supabase
          .from("lists")
          .select("id, name, description")
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!lists || lists.length === 0) {
          return "No lists exist yet.";
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

        return `Your lists:\n${lines.join("\n")}`;
      }

      // View a specific list
      const list = await findListByName(supabase, command.list_name);
      if (!list) {
        return `No list found matching '${command.list_name}'.`;
      }

      const { data: items, error } = await supabase
        .from("list_items")
        .select("position, book:books(title, author)")
        .eq("list_id", list.id)
        .order("position");

      if (error) throw error;

      if (!items || items.length === 0) {
        return `'${list.name}' exists but has no books.`;
      }

      const lines = items.map((item) => {
        const book = item.book as unknown as { title: string; author: string };
        return `${item.position}. ${book.title} by ${book.author}`;
      });

      return `${list.name} (${items.length} book${items.length === 1 ? "" : "s"}):\n${lines.join("\n")}`;
    }

    case "add_books": {
      if (!command.list_name) {
        throw new Error("'add_books' requires list_name");
      }
      if (!command.books || command.books.length === 0) {
        throw new Error("'add_books' requires at least one book title");
      }

      const list = await findListByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No list found matching '${command.list_name}'.`);
      }

      const { found, notFound } = await resolveBooks(supabase, command.books);

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
        });

        if (error) {
          // 23505 = unique violation (book already in list) — skip silently
          if (error.code === "23505") continue;
          throw error;
        }
        added++;
      }

      let msg = `Added ${added} book${added === 1 ? "" : "s"} to '${list.name}'.`;
      if (notFound.length > 0) {
        msg += ` Could not find: ${notFound.map((t) => `'${t}'`).join(", ")}.`;
      }
      const skipped = found.length - added;
      if (skipped > 0) {
        msg += ` ${skipped} already in the list.`;
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

      const list = await findListByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No list found matching '${command.list_name}'.`);
      }

      const { found, notFound } = await resolveBooks(supabase, command.books);

      let removed = 0;
      for (const book of found) {
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
      if (notFound.length > 0) {
        msg += ` Could not find: ${notFound.map((t) => `'${t}'`).join(", ")}.`;
      }
      return msg;
    }

    case "delete": {
      if (!command.list_name) {
        throw new Error("'delete' requires list_name");
      }

      const list = await findListByName(supabase, command.list_name);
      if (!list) {
        throw new Error(`No list found matching '${command.list_name}'.`);
      }

      const { error } = await supabase
        .from("lists")
        .delete()
        .eq("id", list.id);

      if (error) throw error;

      return `Deleted list '${list.name}'.`;
    }

    default:
      throw new Error(`Unknown list action: ${(command as ListCommand).action}`);
  }
}
