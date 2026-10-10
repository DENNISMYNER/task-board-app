import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { emitToBoard } from "../../realtime";
import {
  MIN_ROLE,
  assertBoardActive,
  hasRole,
  requireCommentAccess,
  requireTaskAccess,
} from "../access/access.service";
import { logActivity } from "../activity/activity.service";
import type { CreateCommentInput, UpdateCommentInput } from "./comments.schema";

const authorInclude = { author: { select: { id: true, name: true, avatarUrl: true } } } as const;

/** Deleted comments keep their place in the thread but lose their text and author. */
function present<T extends { deletedAt: Date | null; body: string }>(comment: T) {
  return comment.deletedAt
    ? { ...comment, body: null as string | null, author: null, deleted: true }
    : { ...comment, deleted: false };
}

/**
 * Comments are returned as threads: top-level comments oldest-first, each with its replies.
 * Soft-deleted replies are dropped; a deleted top-level comment stays only while it still has replies.
 */
export async function listComments(userId: string, taskId: string) {
  await requireTaskAccess(userId, taskId, MIN_ROLE.read);

  const topLevel = await prisma.comment.findMany({
    where: { taskId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      ...authorInclude,
      replies: { orderBy: { createdAt: "asc" }, include: authorInclude },
    },
  });

  return topLevel
    .map((comment) => ({
      ...present(comment),
      replies: comment.replies.filter((reply) => !reply.deletedAt).map(present),
    }))
    .filter((comment) => !comment.deleted || comment.replies.length > 0);
}

export async function createComment(userId: string, taskId: string, input: CreateCommentInput) {
  const { task, board } = await requireTaskAccess(userId, taskId, MIN_ROLE.comment);
  assertBoardActive(board);

  if (input.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { taskId: true, parentId: true, deletedAt: true },
    });
    if (!parent || parent.taskId !== taskId) throw new BadRequestError("parentId is not a comment on this task");
    if (parent.parentId) throw new BadRequestError("Replies cannot be nested more than one level deep");
    if (parent.deletedAt) throw new BadRequestError("You cannot reply to a deleted comment");
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { taskId, authorId: userId, parentId: input.parentId ?? null, body: input.body },
      include: authorInclude,
    });
    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      taskId,
      actorId: userId,
      action: "COMMENT_CREATED",
      metadata: {
        commentId: created.id,
        parentId: created.parentId,
        taskNumber: task.number,
        key: board.key,
      },
    });
    return present(created);
  });

  emitToBoard(board.id, "comment:created", userId, { taskId, comment });
  return comment;
}

export async function updateComment(userId: string, commentId: string, input: UpdateCommentInput) {
  const { comment: existing, task, board } = await requireCommentAccess(userId, commentId, MIN_ROLE.comment);
  assertBoardActive(board);
  if (existing.deletedAt) throw new NotFoundError("Comment not found");
  // Only the author edits their own words. Not even admins: they can delete, but not rewrite.
  if (existing.authorId !== userId) throw new ForbiddenError("You can only edit your own comments");

  const comment = await prisma.$transaction(async (tx) => {
    const updated = await tx.comment.update({
      where: { id: commentId },
      data: { body: input.body, editedAt: new Date() },
      include: authorInclude,
    });
    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      taskId: task.id,
      actorId: userId,
      action: "COMMENT_UPDATED",
      metadata: { commentId, taskNumber: task.number, key: board.key },
    });
    return present(updated);
  });

  emitToBoard(board.id, "comment:updated", userId, { taskId: task.id, comment });
  return comment;
}

export async function deleteComment(userId: string, commentId: string): Promise<void> {
  const { comment, task, board, access } = await requireCommentAccess(userId, commentId, MIN_ROLE.comment);
  assertBoardActive(board);
  if (comment.deletedAt) return; // already deleted: DELETE is idempotent

  // Authors can delete their own comments; admins and owners can moderate anyone's.
  if (comment.authorId !== userId && !hasRole(access.role, MIN_ROLE.manage)) throw new ForbiddenError();

  await prisma.$transaction(async (tx) => {
    // Soft delete keeps replies attached to a visible "comment deleted" placeholder.
    await tx.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    await logActivity(tx, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      taskId: task.id,
      actorId: userId,
      action: "COMMENT_DELETED",
      metadata: { commentId, taskNumber: task.number, key: board.key },
    });
  });

  emitToBoard(board.id, "comment:deleted", userId, { taskId: task.id, commentId });
}
