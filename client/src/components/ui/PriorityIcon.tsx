import type { TaskPriority } from "../../lib/api";
import { priorityLabel } from "../../lib/format";
import { cn } from "./cn";

const LEVEL: Record<TaskPriority, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 3 };

/** Three signal bars, like a phone's reception: more bars = more urgent. Urgent turns red. */
export function PriorityIcon({ priority, className }: { priority: TaskPriority; className?: string }) {
  const level = LEVEL[priority];
  const urgent = priority === "URGENT";
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0", urgent ? "text-signal" : "text-muted", className)}
      role="img"
      aria-label={`Priority: ${priorityLabel(priority)}`}
    >
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2 + i * 4.5}
          y={10 - i * 3}
          width="3"
          height={4 + i * 3}
          rx="1"
          fill="currentColor"
          opacity={i < level ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}
