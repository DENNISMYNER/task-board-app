// Pure functions that turn one BoardData into the next. No React, no network, no mutation.
//
// Why a separate module: the same transformations are needed in three places —
//   1. optimistic updates (apply a drop instantly, before the server answers),
//   2. server responses (apply the authoritative result),
//   3. realtime events (apply what another user did).
// Keeping them pure makes them trivial to unit test and impossible to desync.
//
// Convention: if a function can't apply a change (e.g. it references a column we don't have yet)
// it returns the SAME object it was given. Callers compare `next === prev` and refetch instead.

import { positionAfter, sortByPosition } from "../../lib/position";
import type { Board, BoardData, Column, ColumnWithTasks, MoveTaskResult, PositionChange, Task } from "../../lib/api";

export function findTask(data: BoardData, taskId: string): { task: Task; column: ColumnWithTasks } | undefined {
  for (const column of data.columns) {
    const task = column.tasks.find((t) => t.id === taskId);
    if (task) return { task, column };
  }
  return undefined;
}

// ── Tasks ─────────────────────────────────────────────────────

/** Optimistic drop: "task X now sits in column Y after task Z". */
export function applyOptimisticTaskMove(
  data: BoardData,
  move: { taskId: string; columnId: string; afterTaskId: string | null },
): BoardData {
  const found = findTask(data, move.taskId);
  const target = data.columns.find((c) => c.id === move.columnId);
  if (!found || !target) return data;

  const siblings = target.tasks.filter((t) => t.id !== move.taskId); // already sorted
  const moved: Task = {
    ...found.task,
    columnId: target.id,
    position: positionAfter(siblings, move.afterTaskId),
    // Mirrors the server: entering a "completed" column stamps completedAt, leaving clears it.
    completedAt: target.category === "COMPLETED" ? (found.task.completedAt ?? new Date().toISOString()) : null,
  };

  return {
    ...data,
    columns: data.columns.map((c) => {
      if (c.id === target.id) return { ...c, tasks: sortByPosition([...siblings, moved]) };
      if (c.id === found.column.id) return { ...c, tasks: c.tasks.filter((t) => t.id !== move.taskId) };
      return c;
    }),
  };
}

/** Authoritative result of a move (HTTP response or `task:moved` event). */
export function applyTaskMoved(data: BoardData, result: MoveTaskResult): BoardData {
  const { task, changes } = result;
  if (!data.columns.some((c) => c.id === task.columnId)) return data; // unknown column => caller refetches

  const positions = new Map(changes.map((c) => [c.id, c.position]));
  return {
    ...data,
    columns: data.columns.map((column) => {
      const hadTask = column.tasks.some((t) => t.id === task.id);
      const isTarget = column.id === task.columnId;
      const touched = column.tasks.some((t) => positions.has(t.id));
      if (!hadTask && !isTarget && !touched) return column;

      const others = column.tasks
        .filter((t) => t.id !== task.id)
        .map((t) => (positions.has(t.id) ? { ...t, position: positions.get(t.id) as number } : t));
      return { ...column, tasks: sortByPosition(isTarget ? [...others, task] : others) };
    }),
  };
}

/**
 * Insert or replace a task (create/update events, edit responses).
 * With `ifNewer`, an event older than what we already hold is ignored, so a slow event can't
 * overwrite fresher local state.
 */
export function upsertTask(data: BoardData, task: Task, options: { ifNewer?: boolean } = {}): BoardData {
  const existing = findTask(data, task.id);
  if (existing && options.ifNewer && existing.task.updatedAt > task.updatedAt) return data;
  if (!data.columns.some((c) => c.id === task.columnId)) return data;

  return {
    ...data,
    columns: data.columns.map((column) => {
      const without = column.tasks.filter((t) => t.id !== task.id);
      if (column.id === task.columnId) return { ...column, tasks: sortByPosition([...without, task]) };
      return without.length === column.tasks.length ? column : { ...column, tasks: without };
    }),
  };
}

export function removeTask(data: BoardData, taskId: string): BoardData {
  if (!findTask(data, taskId)) return data;
  return {
    ...data,
    columns: data.columns.map((c) =>
      c.tasks.some((t) => t.id === taskId) ? { ...c, tasks: c.tasks.filter((t) => t.id !== taskId) } : c,
    ),
  };
}

// ── Columns ───────────────────────────────────────────────────

export function applyOptimisticColumnMove(
  data: BoardData,
  move: { columnId: string; afterColumnId: string | null },
): BoardData {
  const column = data.columns.find((c) => c.id === move.columnId);
  if (!column) return data;
  const siblings = data.columns.filter((c) => c.id !== move.columnId);
  const moved = { ...column, position: positionAfter(siblings, move.afterColumnId) };
  return { ...data, columns: sortByPosition([...siblings, moved]) };
}

export function applyColumnMoved(data: BoardData, changes: PositionChange[]): BoardData {
  const positions = new Map(changes.map((c) => [c.id, c.position]));
  if (!data.columns.some((c) => positions.has(c.id))) return data;
  return {
    ...data,
    columns: sortByPosition(
      data.columns.map((c) => (positions.has(c.id) ? { ...c, position: positions.get(c.id) as number } : c)),
    ),
  };
}

/** Insert or update a column's own fields (name, category, WIP limit...) while keeping its tasks. */
export function upsertColumn(data: BoardData, column: Column): BoardData {
  const existing = data.columns.find((c) => c.id === column.id);
  const merged: ColumnWithTasks = { ...column, tasks: existing?.tasks ?? [] };
  return {
    ...data,
    columns: sortByPosition(existing ? data.columns.map((c) => (c.id === column.id ? merged : c)) : [...data.columns, merged]),
  };
}

export function removeColumn(data: BoardData, columnId: string): BoardData {
  if (!data.columns.some((c) => c.id === columnId)) return data;
  return { ...data, columns: data.columns.filter((c) => c.id !== columnId) };
}

export function applyBoardUpdated(data: BoardData, board: Board): BoardData {
  return { ...data, board };
}
