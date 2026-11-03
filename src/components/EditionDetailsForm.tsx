import { useState } from "react";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMAT_OPTIONS, normalizeFormat } from "@/lib/isbndb";
import type { Book } from "@/lib/types";

const NO_FORMAT = "none";

export type EditionDetails = Pick<
  Book,
  "format" | "publisher" | "page_count" | "publication_year" | "isbn" | "cover_image_url"
>;

interface EditionDetailsFormProps {
  book: EditionDetails;
  onSave: (details: EditionDetails) => void;
  onCancel: () => void;
}

export function EditionDetailsForm({ book, onSave, onCancel }: EditionDetailsFormProps) {
  const initialFormat = normalizeFormat(book.format);
  const [format, setFormat] = useState(initialFormat ?? NO_FORMAT);
  const [publisher, setPublisher] = useState(book.publisher ?? "");
  const [pages, setPages] = useState(book.page_count?.toString() ?? "");
  const [year, setYear] = useState(book.publication_year?.toString() ?? "");
  const [isbn, setIsbn] = useState(book.isbn ?? "");
  const [coverUrl, setCoverUrl] = useState(book.cover_image_url ?? "");
  const [error, setError] = useState<string | null>(null);

  // Keep an unusual stored format (e.g. "Spiral-bound") selectable
  const formatOptions: string[] = [...FORMAT_OPTIONS];
  if (initialFormat && !formatOptions.includes(initialFormat)) {
    formatOptions.push(initialFormat);
  }

  function handleSave() {
    const pageCount = pages.trim() === "" ? null : Number(pages);
    if (pageCount !== null && (!Number.isInteger(pageCount) || pageCount <= 0)) {
      setError("Pages must be a whole number above 0.");
      return;
    }

    const publicationYear = year.trim() === "" ? null : Number(year);
    const latestYear = new Date().getFullYear() + 2;
    if (
      publicationYear !== null &&
      (!Number.isInteger(publicationYear) || publicationYear < 1000 || publicationYear > latestYear)
    ) {
      setError(`Year must be between 1000 and ${latestYear}.`);
      return;
    }

    onSave({
      format: format === NO_FORMAT ? null : format,
      publisher: publisher.trim() || null,
      page_count: pageCount,
      publication_year: publicationYear,
      isbn: isbn.trim() || null,
      cover_image_url: coverUrl.trim() || null,
    });
  }

  return (
    <div
      className="space-y-3 sm:col-span-2"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="font-medium text-muted-foreground">Format</label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger aria-label="Format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FORMAT}>Not set</SelectItem>
              {formatOptions.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="edition-publisher" className="font-medium text-muted-foreground">
            Publisher
          </label>
          <Input
            id="edition-publisher"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="edition-pages" className="font-medium text-muted-foreground">
            Pages
          </label>
          <Input
            id="edition-pages"
            type="number"
            min={1}
            value={pages}
            onChange={(e) => setPages(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="edition-year" className="font-medium text-muted-foreground">
            Published
          </label>
          <Input
            id="edition-year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="edition-isbn" className="font-medium text-muted-foreground">
            ISBN
          </label>
          <Input
            id="edition-isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
          />
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="edition-cover" className="font-medium text-muted-foreground">
            Cover image URL
          </label>
          <Input
            id="edition-cover"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
          onClick={handleSave}
        >
          <Check className="h-3 w-3" /> Save
        </button>
        <button
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
          onClick={onCancel}
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  );
}
