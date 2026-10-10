import { BadRequestError, ConflictError } from "../../lib/errors";
import { isUniqueViolation, lockBoard, prisma } from "../../lib/prisma";
import { planMove, positionAfter } from "../../lib/position";
import { emitToBoard } from "../../realtime";
import {
  MIN_ROLE,
  assertBoardActive,
  requireBoardAccess,
  requireColumnAccess,
} from "../access/access.service";
import { logActivity } from "../activity/activity.service";
import type { CreateColumnInput, MoveColumnInput, UpdateColumnInput } from "./columns.schema";

const nameTaken = () =>
  new ConflictError("A column with this name already exists on the board", "COLUMN_NAME_TAKEN");

export async function createColumn(userId: string, boardId: string, input: CreateColumnInput) {
  const { board } = await requireBoardAccess(userId, boardId, MIN_ROLE.write);
  assertBoardActive(board);

  try {
    const column = await prisma.$transaction(async (tx) => {
      await lockBoard(tx, boardId); // serialise with other column creates/reorders on this board
      const last = await tx.column.findFirst({
        where: { boardId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const created = await tx.column.create({
        data: {
          boardId,
          name: input.name,
          category: input.category,
          wipLimit: input.wipLimit ?? null,
          position: positionAfter(last?.position),
        },
      });
      await logActivity(tx, {
        workspaceId: board.workspaceId,
        boardId,
        actorId: userId,
        action: "COLUMN_CREATED",
        metadata: { columnId: created.id, name: created.name },
      });
      return created;
    });

    emitToBoard(boardId, "column:created", userId, column); // after commit
    return column;
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

export async function updateColumn(userId: string, columnId: string, input: UpdateColumnInput) {
  const { column, board } = await requireColumnAccess(userId, columnId, MIN_ROLE.write);
  assertBoardActive(board);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.column.update({
        where: { id: columnId },
        data: { name: input.name, category: input.category, wipLimit: input.wipLimit },
      });
      await logActivity(tx, {
        workspaceId: board.workspaceId,
        boardId: board.id,
        actorId: userId,
        action: "COLUMN_UPDATED",
        metadata: {
          columnId,
          changedFields: Object.keys(input),
          ...(input.name && input.name !== column.name ? { from: column.name, to: input.name } : {}),
        },
      });
      return result;
    });

    emitToBoard(board.id, "column:updated", userId, updated);
    return updated;
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

/**
 * Drag-and-drop for columns: "put this column directly after `afterColumnId`" (null = first).
 * The client sends the neighbour it was dropped after, never an index or a raw position:
 * the server owns the ordering math, so clients can't corrupt it.
 */
export async function moveColumn(userId: string, columnId: string, input: MoveColumnInput) {
  const { column, board } = await requireColumnAccess(userId, columnId, MIN_ROLE.write);
  assertBoardActive(board);
  if (input.afterColumnId === columnId) throw new BadRequestError("A column cannot be placed after itself");

  const changes = await prisma.$transaction(async (tx) => {
    await lockBoard(tx, board.id);

    const siblings = await tx.column.findMany({
      where: { boardId: board.id, id: { not: columnId } },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, position: true },
    });
    const plan = planMove(siblings, columnId, input.afterColumnId);
    if (!plan) throw new BadRequestError("afterColumnId is not a column of this board");

    // Normally exactly one row changes. If positions got too tight, every column is renumbered.
    const updates = plan.rebalanced ?? [{ id: columnId, position: plan.position }];
    for (const update of updates) {
      await tx.column.update({ where: { id: update.id }, data: { position: update.position } });
    }

    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      actorId: userId,
      action: "COLUMN_REORDERED",
      metadata: { columnId, name: column.name },
    });
    return updates;
  });

  // `changes` lists every column whose position changed, so clients just apply them.
  emitToBoard(board.id, "column:moved", userId, { columnId, changes });
  return { columnId, changes };
}

export async function deleteColumn(userId: string, columnId: string): Promise<void> {
  const { column, board } = await requireColumnAccess(userId, columnId, MIN_ROLE.manage);
  assertBoardActive(board);

  await prisma.$transaction(async (tx) => {
    // Refuse instead of cascading: silently deleting someone's tasks is the worst kind of surprise.
    const tasks = await tx.task.count({ where: { columnId } });
    if (tasks > 0) {
      throw new ConflictError("Move or delete this column's tasks first", "COLUMN_NOT_EMPTY");
    }
    await tx.column.delete({ where: { id: columnId } });
    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      actorId: userId,
      action: "COLUMN_DELETED",
      metadata: { columnId, name: column.name },
    });
  });

  emitToBoard(board.id, "column:deleted", userId, { columnId });
}
