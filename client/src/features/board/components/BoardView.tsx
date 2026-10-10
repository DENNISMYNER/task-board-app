import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements, CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardData, Task } from "../../../lib/api";
import { findTask } from "../boardCache";
import { boardKeyboardCoordinates } from "../keyboardCoordinates";
import { AddColumnForm } from "./AddColumnForm";
import { ColumnOverlay, SortableColumn } from "./Column";
import { ColumnSettingsDialog } from "./ColumnSettingsDialog";
import { TaskCardView } from "./TaskCard";

/**
 * The layout the user sees while a drag is in progress: which task ids sit in which column, and in
 * which order the columns are. It lives in component state (not the query cache) so a drag that is
 * cancelled leaves no trace, and so we don't hit the network on every pixel of movement.
 */
interface Layout {
  columnOrder: string[];
  items: Record<string, string[]>;
}

type ActiveDrag = { type: "task" | "column"; id: string } | null;

interface Props {
  data: BoardData;
  canWrite: boolean;
  canManage: boolean;
  onMoveTask: (move: { taskId: string; columnId: string; afterTaskId: string | null }) => void;
  onMoveColumn: (move: { columnId: string; afterColumnId: string | null }) => void;
  onOpenTask: (taskId: string) => void;
}

/** Which column currently holds `id`? (`id` may itself be a column id.) */
function findContainer(items: Record<string, string[]>, id: string): string | undefined {
  if (id in items) return id;
  return Object.keys(items).find((key) => items[key]?.includes(id));
}

export function BoardView({ data, canWrite, canManage, onMoveTask, onMoveColumn, onOpenTask }: Props) {
  const boardId = data.board.id;
  const boardKey = data.board.key;
  const { columns } = data;

  const [active, setActive] = useState<ActiveDrag>(null);
  const [draft, setDraft] = useState<Layout | null>(null);
  // The same draft, readable synchronously. dnd-kit calls our handlers first and the screen-reader
  // announcements right after, in the same tick, before React has re-rendered. The announcements read
  // this ref so they describe where the card is *now*, not where it was one event ago.
  const draftRef = useRef<Layout | null>(null);
  const updateDraft = useCallback((next: Layout | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);
  const lastAnnouncement = useRef("");
  const [settingsColumnId, setSettingsColumnId] = useState<string | null>(null);

  // ── Derived data ────────────────────────────────────────────
  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const c of columns) for (const t of c.tasks) map.set(t.id, t);
    return map;
  }, [columns]);
  const columnsById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  // The layout according to the server/cache.
  const committed = useMemo<Layout>(
    () => ({
      columnOrder: columns.map((c) => c.id),
      items: Object.fromEntries(columns.map((c) => [c.id, c.tasks.map((t) => t.id)])),
    }),
    [columns],
  );
  // While dragging (and for a moment after dropping) we render the draft instead.
  const view = draft ?? committed;
  const orderedColumns = view.columnOrder.map((id) => columnsById.get(id)).filter((c) => c !== undefined);

  // ── "Settling": avoid a one-frame snap-back after a drop ────
  // On drop we commit the new order to the cache, but React Query notifies subscribers a tick
  // later. If we cleared the draft right away, the card would flash back to its old place for a
  // frame. So we keep rendering the draft until fresh data arrives (or a short timeout passes).
  const settling = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (settling.current) {
      settling.current = false;
      window.clearTimeout(settleTimer.current);
      updateDraft(null);
    }
  }, [columns, updateDraft]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  function settle(layout: Layout) {
    settling.current = true;
    updateDraft(layout);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settling.current = false;
      updateDraft(null);
    }, 800);
  }

  // ── Sensors ─────────────────────────────────────────────────
  // Mouse: start after moving 6px, so a plain click still opens the task.
  // Touch: start after a 220ms press, so swiping still scrolls the board.
  // Keyboard: Space picks up / drops, arrows move (see keyboardCoordinates.ts), Escape cancels.
  // Enter is left free to open a task.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  // ── Collision detection ─────────────────────────────────────
  // Columns only collide with columns. A task first looks at which column the pointer is inside,
  // then at which card in that column is closest — which is what makes dropping between cards and
  // into empty columns feel right.
  const collisionDetection: CollisionDetection = (args) => {
    if (args.active.data.current?.type === "column") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "column"),
      });
    }

    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    let overId = getFirstCollision(hits, "id");
    if (overId == null) return [];

    const overIsColumn = args.droppableContainers.some((c) => c.id === overId && c.data.current?.type === "column");
    if (overIsColumn) {
      const cardsInColumn = args.droppableContainers.filter(
        (c) => c.data.current?.type === "task" && c.data.current.columnId === overId,
      );
      if (cardsInColumn.length > 0) {
        overId = closestCenter({ ...args, droppableContainers: cardsInColumn })[0]?.id ?? overId;
      }
    }
    return [{ id: overId }];
  };

  // ── Drag handlers ───────────────────────────────────────────
  function onDragStart({ active: a }: DragStartEvent) {
    const type = a.data.current?.type === "column" ? "column" : "task";
    setActive({ type, id: String(a.id) });
    settling.current = false;
    window.clearTimeout(settleTimer.current);
    lastAnnouncement.current = "";
    updateDraft(committed);
  }

  /** Moving a card over another column re-parents it in the draft, so the gap opens up live. */
  function onDragOver({ active: a, over }: DragOverEvent) {
    if (!over || a.data.current?.type !== "task") return;
    const activeId = String(a.id);
    const overId = String(over.id);

    const layout = draftRef.current ?? committed;
    const from = findContainer(layout.items, activeId);
    const to = findContainer(layout.items, overId);
    if (!from || !to || from === to) return;

    const target = layout.items[to] ?? [];
    const overIsColumn = overId in layout.items;
    const overIndex = target.indexOf(overId);
    const translated = a.rect.current.translated;
    const below = !overIsColumn && translated !== null && translated.top > over.rect.top + over.rect.height / 2;
    const index = overIsColumn || overIndex < 0 ? target.length : overIndex + (below ? 1 : 0);

    updateDraft({
      ...layout,
      items: {
        ...layout.items,
        [from]: (layout.items[from] ?? []).filter((id) => id !== activeId),
        [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
      },
    });
  }

  function onDragEnd({ active: a, over }: DragEndEvent) {
    setActive(null);
    const layout = draftRef.current ?? committed;
    if (!over) return updateDraft(null); // dropped outside: nothing changes

    const activeId = String(a.id);
    const overId = String(over.id);

    // ── Column reorder ──
    if (a.data.current?.type === "column") {
      const from = layout.columnOrder.indexOf(activeId);
      const to = layout.columnOrder.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return updateDraft(null);
      const order = arrayMove(layout.columnOrder, from, to);
      settle({ ...layout, columnOrder: order });
      onMoveColumn({ columnId: activeId, afterColumnId: order[to - 1] ?? null });
      return;
    }

    // ── Task move / reorder ──
    const target = findContainer(layout.items, overId);
    const task = findTask(data, activeId)?.task;
    if (!target || !task) return updateDraft(null);

    let items = layout.items;
    const list = items[target] ?? [];
    if (findContainer(items, activeId) === target) {
      const from = list.indexOf(activeId);
      const to = overId in items ? list.length - 1 : list.indexOf(overId);
      if (from >= 0 && to >= 0 && from !== to) items = { ...items, [target]: arrayMove(list, from, to) };
    }

    const finalList = items[target] ?? [];
    const index = finalList.indexOf(activeId);
    const afterTaskId = index > 0 ? (finalList[index - 1] ?? null) : null;

    // Dropped exactly where it started? Then there is nothing to save.
    const originalList = committed.items[task.columnId] ?? [];
    const originalIndex = originalList.indexOf(activeId);
    const originalAfter = originalIndex > 0 ? (originalList[originalIndex - 1] ?? null) : null;
    if (target === task.columnId && afterTaskId === originalAfter) return updateDraft(null);

    settle({ ...layout, items });
    onMoveTask({ taskId: activeId, columnId: target, afterTaskId });
  }

  function onDragCancel() {
    setActive(null);
    updateDraft(null);
  }

  // Screen-reader announcements in plain words, saying where the card is *now* (column and position).
  // dnd-kit's own "over X" is unhelpful here: after a card moves it is "over" its own new slot.
  const where = (id: string | number) => {
    const key = String(id);
    const layout = draftRef.current ?? committed;
    const task = tasksById.get(key);
    if (task) {
      const columnId = findContainer(layout.items, key);
      const list = columnId ? (layout.items[columnId] ?? []) : [];
      const column = columnId ? columnsById.get(columnId) : undefined;
      return `${boardKey}-${task.number} ${task.title} is in ${column?.name ?? "a column"}, position ${list.indexOf(key) + 1} of ${list.length}`;
    }
    const column = columnsById.get(key);
    return `Column ${column?.name ?? ""} is at position ${layout.columnOrder.indexOf(key) + 1} of ${layout.columnOrder.length}`;
  };
  // Only speak when something changed, so hovering back and forth over the same slot stays quiet.
  const speak = (text: string) => {
    if (text === lastAnnouncement.current) return undefined;
    lastAnnouncement.current = text;
    return text;
  };
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => speak(`Picked up. ${where(a.id)}.`),
    onDragOver: ({ active: a }) => speak(`${where(a.id)}.`),
    onDragEnd: ({ active: a }) => {
      lastAnnouncement.current = "";
      return `Dropped. ${where(a.id)}.`;
    },
    onDragCancel: ({ active: a }) => {
      lastAnnouncement.current = "";
      return `Canceled. ${where(a.id)}.`;
    },
  };

  const activeTask = active?.type === "task" ? tasksById.get(active.id) : undefined;
  const activeColumn = active?.type === "column" ? columnsById.get(active.id) : undefined;
  const settingsColumn = settingsColumnId ? (columnsById.get(settingsColumnId) ?? null) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={view.columnOrder} strategy={horizontalListSortingStrategy}>
          <div className="slim-scroll flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-4 pt-1 pb-4 sm:px-6" style={{ maxHeight: "100%" }}>
            {orderedColumns.map((column) => (
              <SortableColumn
                key={column.id}
                boardId={boardId}
                boardKey={boardKey}
                column={column}
                taskIds={view.items[column.id] ?? []}
                tasksById={tasksById}
                canWrite={canWrite}
                onOpenTask={onOpenTask}
                onOpenSettings={setSettingsColumnId}
              />
            ))}
            {canWrite && <AddColumnForm boardId={boardId} />}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
          {activeTask ? <TaskCardView task={activeTask} boardKey={boardKey} lifted /> : null}
          {activeColumn ? <ColumnOverlay column={activeColumn} boardKey={boardKey} tasksById={tasksById} /> : null}
        </DragOverlay>
      </DndContext>

      <ColumnSettingsDialog boardId={boardId} column={settingsColumn} canDelete={canManage} onClose={() => setSettingsColumnId(null)} />
    </>
  );
}
