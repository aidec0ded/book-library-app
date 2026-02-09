import { Link } from "react-router-dom";
import { BookCover } from "@/components/BookCover";

interface BookCoverCardProps {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  className?: string;
}

export function BookCoverCard({
  id,
  title,
  author,
  coverUrl,
  className = "",
}: BookCoverCardProps) {
  return (
    <Link to={`/books/${id}`} className={`group flex flex-col ${className}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg shadow-md transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
        <BookCover title={title} author={author} coverUrl={coverUrl} size="sm" />
      </div>
      <h3 className="mt-2.5 text-sm font-medium leading-tight line-clamp-2 transition-colors group-hover:text-accent">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{author}</p>
    </Link>
  );
}
