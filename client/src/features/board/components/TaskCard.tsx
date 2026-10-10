import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, MessageSquare } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import { cn } from "../../../components/ui/cn";
import { PriorityIcon } from "../../../components/ui/PriorityIcon";
import type { Task } from "../../../lib/api";
import { describeDue } from "../../../lib/format";

interface TaskCardViewProps {
  task: Task;
  boardKey: string;
  /** true when rendered inside <DragOverlay>: the floating copy under the pointer */
  lifted?: boolean;
}

/** Pure presentation of a card. Used by the sortable card and by the drag overlay. */
export function TaskCardView({ task, boardKey, lifted }: TaskCardViewProps) {
  const due = task.dueDate ? describeDue(task.dueDate, task.completedAt !== null) : null;
  const dueTone = {
    overdue: "bg-signal-soft text-signal",
    soon: "bg-warn-soft text-warn",
    normal: "bg-ink/5 text-muted",
    done: "bg-ink/5 text-muted",
  };

  return (
    <div
      className={cn(
        "rounded-card border bg-raised p-3 text-left",
        lifted ? "border-accent shadow-xl" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          {task.completedAt && <Check className="size-3.5 text-done" aria-label="Completed" />}
          {boardKey}-{task.number}
        </span>
        {task.assignee && <Avatar person={task.assignee} size={20} />}
      </div>
      <p className="mt-1 text-sm leading-snug font-medium break-words">{task.title}</p>
      {(task.priority !== "NONE" || due || task._count.comments > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          {task.priority !== "NONE" && <PriorityIcon priority={task.priority} />}
          {due && <span className={cn("rounded px-1.5 py-0.5 font-medium", dueTone[due.tone])}>{due.label}</span>}
          {task._count.comments > 0 && (
            <span className="inline-flex items-center gap-1" aria-label={`${task._count.comments} comments`}>
              <MessageSquare className="size-3.5" aria-hidden />
              {task._count.comments}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface SortableTaskCardProps {
  task: Task;
  boardKey: string;
  disabled: boolean;
  onOpen: (taskId: string) => void;
}

export function SortableTaskCard({ task, boardKey, disabled, onOpen }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
    // `type` and `columnId` are read by the collision detection and drag handlers in BoardView.
    data: { type: "task", columnId: task.columnId },
  });

  // dnd-kit's keyboard sensor uses Space to pick up and Space/Enter to drop. Outside a drag, Enter opens the task.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    listeners?.onKeyDown?.(e);
    if (e.key === "Enter" && !e.defaultPrevented && !isDragging) onOpen(task.id);
  }

  // <li> keeps the list semantics; the inner element carries the button role and drag listeners.
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("list-none", isDragging && "opacity-35")}
    >
      <div
        {...attributes}
        {...listeners}
        onKeyDown={onKeyDown}
        onClick={() => onOpen(task.id)}
        aria-label={`${boardKey}-${task.number}: ${task.title}`}
        className="touch-manipulation rounded-card"
      >
        <TaskCardView task={task} boardKey={boardKey} />
      </div>
    </li>
  );
}
