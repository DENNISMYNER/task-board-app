import { WorkspaceRole } from "../../generated/prisma/client";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

// ─────────────────────────────────────────────────────────────
// Roles & permissions (the single place that defines "who may do what")
// ─────────────────────────────────────────────────────────────

const RANK: Record<WorkspaceRole, number> = { GUEST: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export const roleRank = (role: WorkspaceRole): number => RANK[role];
export const hasRole = (actual: WorkspaceRole, minimum: WorkspaceRole): boolean =>
  RANK[actual] >= RANK[minimum];

/** Minimum role required for each kind of action. Call sites read like policy: MIN_ROLE.write */
export const MIN_ROLE = {
  read: "GUEST",
  comment: "GUEST",
  write: "MEMBER", // create/edit/move tasks, edit columns, create boards
  manage: "ADMIN", // board settings, delete columns, manage members
  owner: "OWNER", // delete workspace, grant the owner role
} as const satisfies Record<string, WorkspaceRole>;

export interface Access {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

/**
 * Verifies the user belongs to the workspace with at least `minRole`.
 *
 * Non-members get 404, not 403: answering "forbidden" would confirm the resource exists.
 * A member whose role is too low gets 403, because they can already see the resource.
 */
export async function requireMembership(
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole = "GUEST",
  notFoundMessage = "Workspace not found",
): Promise<Access> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: {
      workspace: { select: { deletedAt: true } },
      user: { select: { deletedAt: true } },
    },
  });

  if (!membership || membership.workspace.deletedAt) throw new NotFoundError(notFoundMessage);
  if (membership.user.deletedAt) throw new UnauthorizedError("Account is disabled");
  if (!hasRole(membership.role, minRole)) throw new ForbiddenError();

  return { userId, workspaceId, role: membership.role };
}

// ─────────────────────────────────────────────────────────────
// Resource loaders: find the resource, then authorize through its workspace.
// Every controller action goes through one of these, so authorization can't be forgotten.
// ─────────────────────────────────────────────────────────────

export async function requireBoardAccess(userId: string, boardId: string, minRole: WorkspaceRole) {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) throw new NotFoundError("Board not found");
  const access = await requireMembership(userId, board.workspaceId, minRole, "Board not found");
  return { board, access };
}

export async function requireColumnAccess(userId: string, columnId: string, minRole: WorkspaceRole) {
  const column = await prisma.column.findUnique({ where: { id: columnId }, include: { board: true } });
  if (!column) throw new NotFoundError("Column not found");
  const { board, ...columnOnly } = column;
  const access = await requireMembership(userId, board.workspaceId, minRole, "Column not found");
  return { column: columnOnly, board, access };
}

export async function requireTaskAccess(userId: string, taskId: string, minRole: WorkspaceRole) {
  const found = await prisma.task.findUnique({
    where: { id: taskId },
    include: { board: true, column: true },
  });
  if (!found) throw new NotFoundError("Task not found");
  const { board, column, ...task } = found;
  const access = await requireMembership(userId, board.workspaceId, minRole, "Task not found");
  return { task, board, column, access };
}

export async function requireCommentAccess(userId: string, commentId: string, minRole: WorkspaceRole) {
  const found = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { task: { include: { board: true } } },
  });
  if (!found) throw new NotFoundError("Comment not found");
  const { task: taskWithBoard, ...comment } = found;
  const { board, ...task } = taskWithBoard;
  const access = await requireMembership(userId, board.workspaceId, minRole, "Comment not found");
  return { comment, task, board, access };
}

// ─────────────────────────────────────────────────────────────
// Small guards
// ─────────────────────────────────────────────────────────────

/** Archived boards are read-only until an admin restores them. */
export function assertBoardActive(board: { archivedAt: Date | null }): void {
  if (board.archivedAt) throw new ConflictError("This board is archived", "BOARD_ARCHIVED");
}

/** A task can only be assigned to someone who belongs to the workspace. */
export async function assertWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  if (!member) throw new BadRequestError("Assignee must be a member of this workspace");
}
