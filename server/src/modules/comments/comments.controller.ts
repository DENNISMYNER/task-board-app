import type { Request, Response } from "express";
import { currentUserId } from "../../common/request";
import { commentParams, taskParams } from "../../common/schemas";
import { createCommentSchema, updateCommentSchema } from "./comments.schema";
import * as commentsService from "./comments.service";

export async function listForTask(req: Request, res: Response) {
  const { taskId } = taskParams.parse(req.params);
  res.json({ comments: await commentsService.listComments(currentUserId(req), taskId) });
}

export async function create(req: Request, res: Response) {
  const { taskId } = taskParams.parse(req.params);
  const input = createCommentSchema.parse(req.body);
  res.status(201).json({ comment: await commentsService.createComment(currentUserId(req), taskId, input) });
}

export async function update(req: Request, res: Response) {
  const { commentId } = commentParams.parse(req.params);
  const input = updateCommentSchema.parse(req.body);
  res.json({ comment: await commentsService.updateComment(currentUserId(req), commentId, input) });
}

export async function remove(req: Request, res: Response) {
  const { commentId } = commentParams.parse(req.params);
  await commentsService.deleteComment(currentUserId(req), commentId);
  res.status(204).end();
}
