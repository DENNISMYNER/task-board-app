import { describe, expect, it } from "vitest";
import type { BoardData, ColumnWithTasks, Task } from "../../lib/api";
import {
  applyColumnMoved,
  applyOptimisticColumnMove,
  applyOptimisticTaskMove,
  applyTaskMoved,
  findTask,
  removeColumn,
  removeTask,
  upsertColumn,
  upsertTask,
} from "./boardCache";

const T0 = "2026-01-01T00:00:00.000Z";

function task(id: string, columnId: string, position: number, extra: Partial<Task> = {}): Task {
  return {
    id, boardId: "b1", columnId, number: 1, title: id, description: null, priority: "NONE", dueDate: null,
    position, assigneeId: null, creatorId: null, version: 1, completedAt: null, archivedAt: null,
    createdAt: T0, updatedAt: T0, assignee: null, _count: { comments: 0 }, ...extra,
  };
}

function column(id: string, position: number, tasks: Task[], category: ColumnWithTasks["category"] = "UNSTARTED"): ColumnWithTasks {
  return { id, boardId: "b1", name: id, category, position, wipLimit: null, createdAt: T0, updatedAt: T0, tasks };
}

function board(): BoardData {
  return {
    role: "MEMBER",
    board: {
      id: "b1", workspaceId: "w1", name: "Eng", description: null, key: "ENG", taskCounter: 5,
      archivedAt: null,
    createdById: null, createdAt: T0, updatedAt: T0,
    },
    columns: [
      column("todo", 100, [task("a", "todo", 100), task("b", "todo", 200), task("c", "todo", 300)]),
      column("doing", 200, [task("d", "doing", 100)]),
      column("done", 300, [], "COMPLETED"),
    ],
  };
}

const ids = (data: BoardData, columnId: string) => data.columns.find((c) => c.id === columnId)?.tasks.map((t) => t.id);

describe("applyOptimisticTaskMove", () => {
  it("reorders inside a column", () => {
    const next = applyOptimisticTaskMove(board(), { taskId: "c", columnId: "todo", afterTaskId: "a" });
    expect(ids(next, "todo")).toEqual(["a", "c", "b"]);
  });

  it("moves to the top of a column", () => {
    const next = applyOptimisticTaskMove(board(), { taskId: "c", columnId: "todo", afterTaskId: null });
    expect(ids(next, "todo")).toEqual(["c", "a", "b"]);
    expect(findTask(next, "c")?.task.position).toBeGreaterThan(0);
  });

  it("moves across columns, between two tasks", () => {
    const data = applyOptimisticTaskMove(board(), { taskId: "a", columnId: "doing", afterTaskId: null });
    const next = applyOptimisticTaskMove(data, { taskId: "b", columnId: "doing", afterTaskId: "a" });
    expect(ids(next, "todo")).toEqual(["c"]);
    expect(ids(next, "doing")).toEqual(["a", "b", "d"]);
    expect(findTask(next, "b")?.task.columnId).toBe("doing");
  });

  it("drops into an empty column and stamps completedAt for COMPLETED columns", () => {
    const next = applyOptimisticTaskMove(board(), { taskId: "a", columnId: "done", afterTaskId: null });
    expect(ids(next, "done")).toEqual(["a"]);
    expect(findTask(next, "a")?.task.completedAt).not.toBeNull();
    const back = applyOptimisticTaskMove(next, { taskId: "a", columnId: "todo", afterTaskId: null });
    expect(findTask(back, "a")?.task.completedAt).toBeNull();
  });

  it("does not mutate its input and keeps untouched columns identical", () => {
    const before = board();
    const snapshot = JSON.stringify(before);
    const next = applyOptimisticTaskMove(before, { taskId: "a", columnId: "doing", afterTaskId: "d" });
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(next.columns.find((c) => c.id === "done")).toBe(before.columns.find((c) => c.id === "done"));
  });

  it("returns the same object for unknown ids", () => {
    const before = board();
    expect(applyOptimisticTaskMove(before, { taskId: "nope", columnId: "todo", afterTaskId: null })).toBe(before);
    expect(applyOptimisticTaskMove(before, { taskId: "a", columnId: "nope", afterTaskId: null })).toBe(before);
  });
});

describe("applyTaskMoved (authoritative result)", () => {
  it("replaces the optimistic guess with the server's position", () => {
    const optimistic = applyOptimisticTaskMove(board(), { taskId: "a", columnId: "doing", afterTaskId: "d" });
    const server = task("a", "doing", 150_000, { updatedAt: "2026-01-01T00:00:05.000Z" });
    const next = applyTaskMoved(optimistic, { task: server, fromColumnId: "todo", changes: [{ id: "a", position: 150_000 }] });
    expect(findTask(next, "a")?.task.position).toBe(150_000);
    expect(ids(next, "doing")).toEqual(["d", "a"]);
  });

  it("applies a rebalance that renumbers other tasks", () => {
    const server = task("c", "todo", 65_536 * 2);
    const next = applyTaskMoved(board(), {
      task: server,
      fromColumnId: "todo",
      changes: [
        { id: "a", position: 65_536 * 1 },
        { id: "c", position: 65_536 * 2 },
        { id: "b", position: 65_536 * 3 },
      ],
    });
    expect(ids(next, "todo")).toEqual(["a", "c", "b"]);
  });

  it("returns the same object when the target column is unknown", () => {
    const before = board();
    const result = { task: task("a", "ghost", 1), fromColumnId: "todo", changes: [] };
    expect(applyTaskMoved(before, result)).toBe(before);
  });
});

describe("upsertTask / removeTask", () => {
  it("inserts a new task in order", () => {
    const next = upsertTask(board(), task("n", "todo", 250));
    expect(ids(next, "todo")).toEqual(["a", "b", "n", "c"]);
  });

  it("ignores stale events when ifNewer is set", () => {
    const fresh = task("a", "todo", 100, { title: "fresh", updatedAt: "2026-01-02T00:00:00.000Z" });
    const stale = task("a", "todo", 100, { title: "stale", updatedAt: "2026-01-01T12:00:00.000Z" });
    const withFresh = upsertTask(board(), fresh);
    const next = upsertTask(withFresh, stale, { ifNewer: true });
    expect(next).toBe(withFresh);
    expect(findTask(next, "a")?.task.title).toBe("fresh");
  });

  it("moves a task between columns when its columnId changed", () => {
    const next = upsertTask(board(), task("a", "doing", 50, { updatedAt: "2026-02-01T00:00:00.000Z" }));
    expect(ids(next, "todo")).toEqual(["b", "c"]);
    expect(ids(next, "doing")).toEqual(["a", "d"]);
  });

  it("removes a task and is a no-op for unknown ids", () => {
    const before = board();
    expect(ids(removeTask(before, "b"), "todo")).toEqual(["a", "c"]);
    expect(removeTask(before, "nope")).toBe(before);
  });
});

describe("columns", () => {
  it("reorders columns optimistically", () => {
    const next = applyOptimisticColumnMove(board(), { columnId: "done", afterColumnId: null });
    expect(next.columns.map((c) => c.id)).toEqual(["done", "todo", "doing"]);
  });

  it("applies server position changes", () => {
    const next = applyColumnMoved(board(), [{ id: "todo", position: 999 }]);
    expect(next.columns.map((c) => c.id)).toEqual(["doing", "done", "todo"]);
  });

  it("upserts a column without losing its tasks, adds new ones empty, and removes", () => {
    const base = board();
    const renamed = upsertColumn(base, { ...base.columns[0]!, name: "Ready" });
    expect(renamed.columns[0]?.name).toBe("Ready");
    expect(renamed.columns[0]?.tasks).toHaveLength(3);

    const added = upsertColumn(base, { ...base.columns[0]!, id: "review", name: "Review", position: 250 });
    expect(added.columns.map((c) => c.id)).toEqual(["todo", "doing", "review", "done"]);
    expect(added.columns[2]?.tasks).toEqual([]);

    expect(removeColumn(added, "review").columns.map((c) => c.id)).toEqual(["todo", "doing", "done"]);
  });
});
