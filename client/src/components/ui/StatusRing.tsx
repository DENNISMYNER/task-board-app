import type { StatusCategory } from "../../lib/api";
import { cn } from "./cn";

const tone: Record<StatusCategory, string> = {
  BACKLOG: "text-muted",
  UNSTARTED: "text-muted",
  STARTED: "text-accent",
  COMPLETED: "text-done",
  CANCELED: "text-muted",
};

const LABEL: Record<StatusCategory, string> = {
  BACKLOG: "Backlog",
  UNSTARTED: "Not started",
  STARTED: "In progress",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};
export const categoryLabel = (c: StatusCategory) => LABEL[c];

/** A small ring that fills as work progresses. The shape carries the meaning, not just the colour. */
export function StatusRing({ category, className }: { category: StatusCategory; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", tone[category], className)} fill="none" role="img" aria-label={LABEL[category]}>
      {category === "BACKLOG" && <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.75" strokeDasharray="2.2 2.4" />}
      {category === "UNSTARTED" && <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.75" />}
      {category === "STARTED" && (
        <>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />
        </>
      )}
      {category === "COMPLETED" && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m5 8.2 2.2 2.2L11.2 6" stroke="var(--surface)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {category === "CANCELED" && (
        <>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.75" />
          <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
