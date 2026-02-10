import { Check, BookOpen, Circle } from "lucide-react";
import type { PathProgress } from "@/lib/types";

const PROGRESS_CONFIG: Record<
  PathProgress,
  { label: string; className: string; icon: typeof Check }
> = {
  not_started: {
    label: "Not started",
    className:
      "border-muted-foreground/30 text-muted-foreground bg-muted/50",
    icon: Circle,
  },
  reading: {
    label: "Reading",
    className:
      "border-violet-300 text-violet-600 bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:bg-violet-950/30",
    icon: BookOpen,
  },
  completed: {
    label: "Completed",
    className:
      "border-emerald-300 text-emerald-600 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30",
    icon: Check,
  },
};

const NEXT: Record<PathProgress, PathProgress> = {
  not_started: "reading",
  reading: "completed",
  completed: "not_started",
};

interface ProgressBadgeProps {
  progress: PathProgress;
  onClick?: (next: PathProgress) => void;
}

export function ProgressBadge({ progress, onClick }: ProgressBadgeProps) {
  const config = PROGRESS_CONFIG[progress];
  const Icon = config.icon;

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(NEXT[progress]);
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:opacity-80 ${config.className}`}
      title={`Click to mark as ${NEXT[progress].replace("_", " ")}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </button>
  );
}
