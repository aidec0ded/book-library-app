import { supabase } from "./supabase";
import { fetchAllRows } from "./fetch-all";

interface ExportBook {
  title: string;
  author: string;
  isbn: string | null;
  rating: number | null;
  status: string | null;
  date_started: string | null;
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
  "Date Started",
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
    book.date_started ?? "",
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

/** The reader's whole library as CSV, every row. */
export async function libraryCSV(): Promise<{ csv: string; count: number }> {
  const books = await fetchAllRows<ExportBook>((from, to) =>
    supabase
      .from("books")
      .select(
        "title, author, isbn, rating, status, date_started, date_finished, publication_year, page_count, publisher, format, notes, book_type, genre, is_favorite",
      )
      .order("sort_title")
      .order("id")
      .range(from, to),
  );
  const csv = [CSV_COLUMNS.join(","), ...books.map(bookToRow)].join("\n");
  return { csv, count: books.length };
}

/** Saves a file to the reader's device. */
export function download(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked after the download starts, not before: some browsers read the URL late
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const today = () => new Date().toISOString().slice(0, 10);

export async function exportLibraryCSV(): Promise<{ count: number }> {
  const { csv, count } = await libraryCSV();
  if (count === 0) throw new Error("No books to export.");
  download(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `rekollekt-library-${today()}.csv`);
  return { count };
}
