import { supabase } from "./supabase";

interface ExportBook {
  title: string;
  author: string;
  isbn: string | null;
  rating: number | null;
  status: string | null;
  date_finished: string | null;
  publication_year: number | null;
  page_count: number | null;
  publisher: string | null;
  format: string | null;
  notes: string | null;
  book_type: string | null;
  genre: string | null;
  is_favorite: boolean;
}

const CSV_COLUMNS = [
  "Title",
  "Author",
  "ISBN",
  "Rating",
  "Status",
  "Date Finished",
  "Publication Year",
  "Pages",
  "Publisher",
  "Format",
  "Notes",
  "Book Type",
  "Genre",
  "Favorite",
];

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function bookToRow(book: ExportBook): string {
  const fields = [
    book.title,
    book.author,
    book.isbn ?? "",
    book.rating != null ? String(book.rating) : "",
    book.status ?? "",
    book.date_finished ?? "",
    book.publication_year != null ? String(book.publication_year) : "",
    book.page_count != null ? String(book.page_count) : "",
    book.publisher ?? "",
    book.format ?? "",
    book.notes ?? "",
    book.book_type ?? "",
    book.genre ?? "",
    book.is_favorite ? "Yes" : "",
  ];
  return fields.map(escapeCSV).join(",");
}

export async function exportLibraryCSV(): Promise<{ count: number }> {
  const { data: books, error } = await supabase
    .from("books")
    .select(
      "title, author, isbn, rating, status, date_finished, publication_year, page_count, publisher, format, notes, book_type, genre, is_favorite",
    )
    .order("title");

  if (error) throw error;
  if (!books || books.length === 0) throw new Error("No books to export.");

  const rows = (books as ExportBook[]).map(bookToRow);
  const csv = [CSV_COLUMNS.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekollekt-library-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  return { count: books.length };
}
