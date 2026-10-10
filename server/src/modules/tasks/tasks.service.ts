import type { Prisma, Task } from "../../generated/prisma/client";
import { BadRequestError, ConflictError } from "../../lib/errors";
import { lockColumn, prisma, type Db } from "../../lib/prisma";
import { planMove, positionAfter } from "../../lib/position";
import { emitToBoard } from "../../realtime";
import {
  MIN_ROLE,
  assertBoardActive,
  assertWorkspaceMember,
  requireBoardAccess,
  requireTaskAccess,
} from "../access/access.service";
import { logActivity, type ActivityEntry } from "../activity/activity.service";
import type { CreateTaskInput, MoveTaskInput, UpdateTaskInput } from "./tasks.schema";

const personSelect = { id: true, name: true, avatarUrl: true } as const;

// What every task response (and realtime event) carries, so the client can render it as-is.
const taskInclude = {
  assignee: { select: personSelect },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

type ChangeLog = Pick<ActivityEntry, "action" | "metadata">;

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createTask(userId: string, boardId: string, input: CreateTaskInput) {
  const { board } = await requireBoardAccess(userId, boardId, MIN_ROLE.write);
  assertBoardActive(board);
  if (input.assigneeId) await assertWorkspaceMember(board.workspaceId, input.assigneeId);

  const task = await prisma.$transaction(async (tx) => {
    const column = await tx.column.findFirst({
      where: { id: input.columnId, boardId }, // the board filter stops cross-board column ids
      select: { id: true, name: true, category: true },
    });
    if (!column) throw new BadRequestError("columnId does not belong to this board");

    await lockColumn(tx, column.id);
    const last = await tx.task.findFirst({
      where: { columnId: column.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    // Per-board sequence (ENG-1, ENG-2...). The UPDATE takes a row lock, so two concurrent creates
    // can't receive the same number and no number is skipped unless the transaction rolls back.
    const { taskCounter } = await tx.board.update({
      where: { id: boardId },
      data: { taskCounter: { increment: 1 } },
      select: { taskCounter: true },
    });

    const created = await tx.task.create({
      data: {
        boardId,
        columnId: column.id,
        number: taskCounter,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        assigneeId: input.assigneeId ?? null,
        creatorId: userId,
        position: positionAfter(last?.position),
        completedAt: column.category === "COMPLETED" ? new Date() : null,
      },
      include: taskInclude,
    });

    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId,
      taskId: created.id,
      actorId: userId,
      action: "TASK_CREATED",
      metadata: {
        taskNumber: created.number,
        key: board.key,
        title: created.title,
        columnId: column.id,
        columnName: column.name,
      },
    });
    return created;
  });

  emitToBoard(boardId, "task:created", userId, task); // after commit
  return task;
}

// ─────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────

export async function getTask(userId: string, taskId: string) {
  const { board } = await requireTaskAccess(userId, taskId, MIN_ROLE.read);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      ...taskInclude,
      creator: { select: personSelect },
      column: { select: { id: true, name: true, category: true } },
    },
  });
  return { ...task, board: { id: board.id, key: board.key, name: board.name } };
}

// ─────────────────────────────────────────────────────────────
// Update (optimistic concurrency)
// ─────────────────────────────────────────────────────────────

async function versionConflict(db: Db, taskId: string) {
  // Send back the current state so the client can show a diff or merge instead of just failing.
  const current = await db.task.findUnique({ where: { id: taskId }, include: taskInclude });
  return new ConflictError("This task was changed by someone else", "VERSION_CONFLICT", { current });
}

const timeOf = (date: Date | null | undefined) => date?.getTime() ?? null;

/** Compare before/after and describe what really changed, one audit entry per kind of change. */
function describeTaskChanges(before: Task, input: UpdateTaskInput): ChangeLog[] {
  const logs: ChangeLog[] = [];
  const base = { taskNumber: before.number };

  const changedText: string[] = [];
  if (input.title !== undefined && input.title !== before.title) changedText.push("title");
  if (input.description !== undefined && (input.description ?? null) !== before.description) {
    changedText.push("description"); // the content itself is not copied into the log
  }
  if (changedText.length > 0) {
    logs.push({
      action: "TASK_UPDATED",
      metadata: {
        ...base,
        changedFields: changedText,
        ...(changedText.includes("title") ? { from: before.title, to: input.title ?? null } : {}),
      },
    });
  }

  if (input.priority !== undefined && input.priority !== before.priority) {
    logs.push({
      action: "TASK_PRIORITY_CHANGED",
      metadata: { ...base, title: before.title, from: before.priority, to: input.priority },
    });
  }

  if (input.dueDate !== undefined && timeOf(input.dueDate) !== timeOf(before.dueDate)) {
    logs.push({
      action: "TASK_DUE_DATE_CHANGED",
      metadata: {
        ...base,
        title: before.title,
        from: before.dueDate?.toISOString() ?? null,
        to: input.dueDate?.toISOString() ?? null,
      },
    });
  }

  if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId) {
    logs.push({
      action: input.assigneeId ? "TASK_ASSIGNED" : "TASK_UNASSIGNED",
      metadata: { ...base, title: before.title, from: before.assigneeId, to: input.assigneeId },
    });
  }

  return logs;
}

export async function updateTask(userId: string, taskId: string, input: UpdateTaskInput) {
  const { task: current, board } = await requireTaskAccess(userId, taskId, MIN_ROLE.write);
  assertBoardActive(board);
  if (input.assigneeId) await assertWorkspaceMember(board.workspaceId, input.assigneeId);

  if (current.version !== input.version) throw await versionConflict(prisma, taskId);

  const changes = describeTaskChanges(current, input);
  if (changes.length === 0) {
    return prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }); // nothing to do
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Compare-and-swap: only update if the version is still the one the client saw. Two people saving
    // at the same moment can't both win; the loser gets a 409 instead of silently overwriting.
    const result = await tx.task.updateMany({
      where: { id: taskId, version: input.version },
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate,
        assigneeId: input.assigneeId,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw await versionConflict(tx, taskId);

    const fresh = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    await logActivity(
      tx,
      changes.map((change) => ({
        workspaceId: board.workspaceId,
        boardId: board.id,
        taskId,
        actorId: userId,
        ...change,
      })),
    );
    return fresh;
  });

  emitToBoard(board.id, "task:updated", userId, updated);
  return updated;
}

// ─────────────────────────────────────────────────────────────
// Move (drag and drop)
// ─────────────────────────────────────────────────────────────

/**
 * "Put this task in column X, directly after task Y." Handles both reordering inside a column and
 * moving across columns. The client never sends a raw position: the server computes it.
 *
 * Concurrency: the target column row is locked for the transaction, so two people dropping cards
 * into the same column take turns and can't compute the same position.
 */
export async function moveTask(userId: string, taskId: string, input: MoveTaskInput) {
  const { board } = await requireTaskAccess(userId, taskId, MIN_ROLE.write);
  assertBoardActive(board);
  if (input.afterTaskId === taskId) throw new BadRequestError("A task cannot be placed after itself");

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.column.findFirst({
      where: { id: input.columnId, boardId: board.id },
      select: { id: true, name: true, category: true },
    });
    if (!target) throw new BadRequestError("columnId does not belong to this board");

    await lockColumn(tx, target.id);

    // Re-read the task now that we hold the lock, so "where it came from" is accurate.
    const task = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { number: true, title: true, completedAt: true, column: { select: { id: true, name: true } } },
    });

    const siblings = await tx.task.findMany({
      where: { columnId: target.id, archivedAt: null, id: { not: taskId } },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, position: true },
    });
    const plan = planMove(siblings, taskId, input.afterTaskId);
    if (!plan) throw new BadRequestError("afterTaskId is not a task in the target column");

    // Moving into a "completed" column stamps completedAt; moving out clears it.
    const completedAt = target.category === "COMPLETED" ? (task.completedAt ?? new Date()) : null;

    // Positional moves deliberately do NOT bump `version`: that guards content edits (title,
    // description...), and dragging a card shouldn't make someone's in-progress edit conflict.
    const moved = await tx.task.update({
      where: { id: taskId },
      data: { columnId: target.id, position: plan.position, completedAt },
      include: taskInclude,
    });

    // Normally exactly one row changed. If the column had to be renumbered, update the others too.
    const changes = plan.rebalanced ?? [{ id: taskId, position: plan.position }];
    for (const other of changes) {
      if (other.id === taskId) continue;
      await tx.task.update({ where: { id: other.id }, data: { position: other.position } });
    }

    // Only moves between columns are audit-worthy; reordering inside a column would just be noise.
    if (task.column.id !== target.id) {
      await logActivity(tx, {
        workspaceId: board.workspaceId,
        boardId: board.id,
        taskId,
        actorId: userId,
        action: "TASK_MOVED",
        metadata: {
          taskNumber: task.number,
          key: board.key,
          title: task.title,
          from: { columnId: task.column.id, name: task.column.name },
          to: { columnId: target.id, name: target.name },
        },
      });
    }

    return { task: moved, fromColumnId: task.column.id, changes };
  });

  // `changes` = every task whose position changed (usually just the one). Clients apply them in order.
  emitToBoard(board.id, "task:moved", userId, result);
  return result;
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const { task, board, column } = await requireTaskAccess(userId, taskId, MIN_ROLE.write);
  assertBoardActive(board);

  await prisma.$transaction(async (tx) => {
    // The log row's task FK becomes NULL once the task is gone, so the snapshot lives in metadata.
    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      actorId: userId,
      action: "TASK_DELETED",
      metadata: {
        taskId,
        taskNumber: task.number,
        key: board.key,
        title: task.title,
        columnName: column.name,
      },
    });
    await tx.task.delete({ where: { id: taskId } }); // its comments are removed by the cascade
  });

  emitToBoard(board.id, "task:deleted", userId, { taskId, columnId: task.columnId });
}
