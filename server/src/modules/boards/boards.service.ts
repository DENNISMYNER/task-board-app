import type { ColumnCreateWithoutBoardInput } from "../../generated/prisma/models/Column";
import { ConflictError } from "../../lib/errors";
import { isUniqueViolation, prisma } from "../../lib/prisma";
import { POSITION_GAP } from "../../lib/position";
import { emitToBoard } from "../../realtime";
import { MIN_ROLE, requireBoardAccess, requireMembership } from "../access/access.service";
import { logActivity } from "../activity/activity.service";
import type { CreateBoardInput, UpdateBoardInput } from "./boards.schema";

// Every new board starts with a sensible workflow. `category` is what the app keys off
// ("is this done?"), so users can rename these columns freely.
const DEFAULT_COLUMNS: ReadonlyArray<Pick<ColumnCreateWithoutBoardInput, "name" | "category">> = [
  { name: "Backlog", category: "BACKLOG" },
  { name: "Todo", category: "UNSTARTED" },
  { name: "In Progress", category: "STARTED" },
  { name: "Done", category: "COMPLETED" },
];

const personSelect = { id: true, name: true, avatarUrl: true } as const;

export async function createBoard(userId: string, workspaceId: string, input: CreateBoardInput) {
  await requireMembership(userId, workspaceId, MIN_ROLE.write);

  try {
    return await prisma.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: {
          workspaceId,
          name: input.name,
          key: input.key,
          description: input.description,
          createdById: userId,
          columns: {
            create: DEFAULT_COLUMNS.map((column, index) => ({
              ...column,
              position: (index + 1) * POSITION_GAP,
            })),
          },
        },
        include: { columns: { orderBy: { position: "asc" } } },
      });
      await logActivity(tx, {
        workspaceId,
        boardId: board.id,
        actorId: userId,
        action: "BOARD_CREATED",
        metadata: { name: board.name, key: board.key },
      });
      return board;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`The key "${input.key}" is already used by another board`, "BOARD_KEY_TAKEN");
    }
    throw err;
  }
}

export async function listBoards(userId: string, workspaceId: string, includeArchived: boolean) {
  await requireMembership(userId, workspaceId, MIN_ROLE.read);
  return prisma.board.findMany({
    where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
}

/**
 * The query behind the board screen: columns in order, each with its tasks in order, in a single
 * round trip. For very large boards, paginate tasks per column instead of loading them all.
 */
export async function getBoard(userId: string, boardId: string) {
  const { board, access } = await requireBoardAccess(userId, boardId, MIN_ROLE.read);

  const columns = await prisma.column.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    include: {
      tasks: {
        where: { archivedAt: null },
        orderBy: [{ position: "asc" }, { id: "asc" }], // id breaks ties if two positions ever collide
        include: {
          assignee: { select: personSelect },
          _count: { select: { comments: true } },
        },
      },
    },
  });

  return { board, columns, role: access.role };
}

/** Rename, edit the description, archive (`archived: true`) or restore (`archived: false`) a board. */
export async function updateBoard(userId: string, boardId: string, input: UpdateBoardInput) {
  const { board } = await requireBoardAccess(userId, boardId, MIN_ROLE.manage);

  // Archiving is idempotent: archiving an archived board keeps its original archive date.
  const archivedAt =
    input.archived === undefined ? undefined : input.archived ? (board.archivedAt ?? new Date()) : null;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.board.update({
      where: { id: boardId },
      data: { name: input.name, description: input.description, archivedAt },
    });
    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId,
      actorId: userId,
      action: input.archived === true ? "BOARD_ARCHIVED" : "BOARD_UPDATED",
      metadata: { name: result.name, changedFields: Object.keys(input) },
    });
    return result;
  });

  emitToBoard(boardId, "board:updated", userId, updated);
  return updated;
}
