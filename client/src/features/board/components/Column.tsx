import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Settings2 } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../components/ui/cn";
import { StatusRing } from "../../../components/ui/StatusRing";
import type { ColumnWithTasks, Task } from "../../../lib/api";
import { AddTaskForm } from "./AddTaskForm";
import { SortableTaskCard, TaskCardView } from "./TaskCard";

interface ColumnFrameProps {
  column: ColumnWithTasks;
  taskCount: number;
  handleProps?: HTMLAttributes<HTMLElement> | undefined;
  canEdit?: boolean;
  onOpenSettings?: (() => void) | undefined;
  lifted?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

/** The column chrome: header + list area + footer. Shared by the real column and the drag overlay. */
export function ColumnFrame({ column, taskCount, handleProps, canEdit, onOpenSettings, lifted, children, footer }: ColumnFrameProps) {
  const overLimit = column.wipLimit !== null && taskCount > column.wipLimit;
  return (
    <section
      aria-label={column.name}
      className={cn(
        "flex max-h-full w-[19rem] shrink-0 flex-col rounded-col border bg-surface",
        lifted ? "border-accent shadow-xl" : "border-line",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        {handleProps ? (
          <span {...handleProps} className="-ml-1 grid size-6 cursor-grab place-items-center rounded text-muted hover:bg-ink/5 active:cursor-grabbing" title="Drag to reorder column">
            <GripVertical className="size-4" aria-hidden />
          </span>
        ) : null}
        <StatusRing category={column.category} />
        <h3 className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold">{column.name}</h3>
        <span
          className={cn("rounded-full px-2 py-0.5 text-xs font-medium", overLimit ? "bg-signal-soft text-signal" : "text-muted")}
          aria-label={column.wipLimit !== null ? `${taskCount} of ${column.wipLimit} tasks${overLimit ? ", over the limit" : ""}` : `${taskCount} tasks`}
        >
          {taskCount}
          {column.wipLimit !== null && `/${column.wipLimit}`}
        </span>
        {canEdit && (
          <Button variant="ghost" size="sm" className="!px-1.5" aria-label={`Settings for ${column.name}`} onClick={onOpenSettings}>
            <Settings2 className="size-4" aria-hidden />
          </Button>
        )}
      </header>
      <div className="slim-scroll min-h-12 flex-1 overflow-y-auto px-2.5 pb-2">{children}</div>
      {footer && <div className="px-2.5 pt-1 pb-2.5">{footer}</div>}
    </section>
  );
}

interface SortableColumnProps {
  boardId: string;
  boardKey: string;
  column: ColumnWithTasks;
  /** Task ids in display order. During a drag this comes from the draft layout, not the cache. */
  taskIds: string[];
  tasksById: Map<string, Task>;
  canWrite: boolean;
  onOpenTask: (taskId: string) => void;
  onOpenSettings: (columnId: string) => void;
}

export function SortableColumn({ boardId, boardKey, column, taskIds, tasksById, canWrite, onOpenTask, onOpenSettings }: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: !canWrite,
    data: { type: "column" },
  });

  const tasks = taskIds.map((id) => tasksById.get(id)).filter((t): t is Task => t !== undefined);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex max-h-full", isDragging && "opacity-40")}
    >
      <ColumnFrame
        column={column}
        taskCount={tasks.length}
        handleProps={canWrite ? ({ ...attributes, ...listeners } as HTMLAttributes<HTMLElement>) : undefined}
        canEdit={canWrite}
        onOpenSettings={() => onOpenSettings(column.id)}
        footer={canWrite ? <AddTaskForm boardId={boardId} columnId={column.id} /> : null}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <ul className="flex min-h-10 flex-col gap-2">
            {tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} boardKey={boardKey} disabled={!canWrite} onOpen={onOpenTask} />
            ))}
          </ul>
        </SortableContext>
        {tasks.length === 0 && <p className="pointer-events-none px-1 py-2 text-[13px] text-muted">No tasks here yet.</p>}
      </ColumnFrame>
    </div>
  );
}

/** Static copy of a column for <DragOverlay> while the column itself is being dragged. */
export function ColumnOverlay({ column, boardKey, tasksById }: { column: ColumnWithTasks; boardKey: string; tasksById: Map<string, Task> }) {
  return (
    <ColumnFrame column={column} taskCount={column.tasks.length} lifted>
      <ul className="flex flex-col gap-2">
        {column.tasks.map((t) => {
          const task = tasksById.get(t.id) ?? t;
          return (
            <li key={task.id} className="list-none">
              <TaskCardView task={task} boardKey={boardKey} />
            </li>
          );
        })}
      </ul>
    </ColumnFrame>
  );
}
