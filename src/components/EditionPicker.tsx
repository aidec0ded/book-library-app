import { useMemo, useState } from "react";
import {
  editionPages,
  editionYear,
  formatCategory,
  isLikelyNonEdition,
  languageCode,
  languageName,
  normalizeFormat,
  preferredLanguage,
  sortEditions,
  type FormatCategory,
  type ISBNdbBook,
} from "@/lib/isbndb";

const FORMAT_LABELS: Record<FormatCategory, string> = {
  hardcover: "Hardcover",
  paperback: "Paperback",
  ebook: "eBook",
  audiobook: "Audiobook",
  other: "Other",
};

function EditionCover({ url }: { url?: string }) {
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        className="h-16 w-11 shrink-0 rounded object-cover"
        loading="lazy"
        onError={() => setBroken(true)}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth === 0) setBroken(true);
        }}
      />
    );
  }

  return (
    <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
      No img
    </div>
  );
}

interface EditionPickerProps {
  editions: ISBNdbBook[];
  /** ISBN of the edition already on the book, when changing an edition. */
  currentIsbn?: string | null;
  /** Shown below the list, for readers whose edition isn't listed. */
  notListedHint: string;
  onSelect: (book: ISBNdbBook) => void;
}

export function EditionPicker({
  editions,
  currentIsbn,
  notListedHint,
  onSelect,
}: EditionPickerProps) {
  const preferred = preferredLanguage();
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [format, setFormat] = useState<FormatCategory | "all">("all");

  const sorted = useMemo(() => sortEditions(editions, preferred), [editions, preferred]);

  // Listings with no language stay visible: many are in the reader's language
  const inLanguage = sorted.filter((e) => {
    const code = languageCode(e.language);
    return code === null || code === preferred;
  });
  const hiddenCount = sorted.length - inLanguage.length;
  // With nothing in the reader's language, there's nothing to hide behind a toggle
  const allLanguages = showAllLanguages || inLanguage.length === 0;
  const available = allLanguages ? sorted : inLanguage;

  const categories = (Object.keys(FORMAT_LABELS) as FormatCategory[]).filter((c) =>
    available.some((e) => formatCategory(e.binding) === c),
  );
  // The selected format may disappear when the language filter changes
  const activeFormat = format !== "all" && categories.includes(format) ? format : "all";
  const visible =
    activeFormat === "all"
      ? available
      : available.filter((e) => formatCategory(e.binding) === activeFormat);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {categories.length > 1 &&
          (["all", ...categories] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFormat(c)}
              aria-pressed={activeFormat === c}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeFormat === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {c === "all" ? "All formats" : FORMAT_LABELS[c]}
            </button>
          ))}
        {hiddenCount > 0 && inLanguage.length > 0 && (
          <button
            onClick={() => setShowAllLanguages((v) => !v)}
            className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showAllLanguages
              ? `Only ${languageName(preferred)}`
              : `Show all languages (${hiddenCount} more)`}
          </button>
        )}
      </div>

      <div className="divide-y rounded-lg border">
        {visible.map((edition, i) => {
          const isbn = edition.isbn13 || edition.isbn;
          const year = editionYear(edition);
          const pages = editionPages(edition);
          const code = languageCode(edition.language);
          const isCurrent = !!isbn && isbn === currentIsbn;
          return (
            <button
              key={isbn ?? `${edition.title}-${i}`}
              onClick={() => onSelect(edition)}
              className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <EditionCover url={edition.image} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    {[normalizeFormat(edition.binding) ?? "Format unknown", year]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {isCurrent && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      Current edition
                    </span>
                  )}
                  {code && code !== preferred && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {languageName(code)}
                    </span>
                  )}
                  {isLikelyNonEdition(edition) && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      May be a guide or set
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {edition.publisher?.trim() || "Publisher unknown"}
                  {pages && ` · ${pages.toLocaleString()} pages`}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[isbn && `ISBN ${isbn}`, edition.title].filter(Boolean).join(" · ")}
                </p>
              </div>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No editions match these filters.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{notListedHint}</p>
    </div>
  );
}
