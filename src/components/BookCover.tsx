interface BookCoverProps {
  title: string;
  author: string;
  coverUrl: string | null;
  size: "sm" | "lg";
  className?: string;
}

export function BookCover({
  title,
  author,
  coverUrl,
  size,
  className = "",
}: BookCoverProps) {
  const sizeClass = size === "lg" ? "w-48" : "w-full";

  if (coverUrl) {
    return (
      <div
        className={`aspect-[2/3] overflow-hidden rounded-md ${sizeClass} ${className}`}
      >
        <img
          src={coverUrl}
          alt={`Cover of ${title}`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex aspect-[2/3] flex-col items-center justify-center rounded-md bg-secondary px-3 text-center ${sizeClass} ${className}`}
    >
      <p className="font-serif text-sm font-bold leading-tight line-clamp-3">
        {title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
        {author}
      </p>
    </div>
  );
}
