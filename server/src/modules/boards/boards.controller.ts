import type { Request, Response } from "express";
import { currentUserId } from "../../common/request";
import { boardParams, workspaceParams } from "../../common/schemas";
import { createBoardSchema, listBoardsQuery, updateBoardSchema } from "./boards.schema";
import * as boardsService from "./boards.service";

export async function listForWorkspace(req: Request, res: Response) {
  const { workspaceId } = workspaceParams.parse(req.params);
  const { includeArchived } = listBoardsQuery.parse(req.query);
  res.json({ boards: await boardsService.listBoards(currentUserId(req), workspaceId, includeArchived) });
}

export async function createInWorkspace(req: Request, res: Response) {
  const { workspaceId } = workspaceParams.parse(req.params);
  const input = createBoardSchema.parse(req.body);
  res.status(201).json({ board: await boardsService.createBoard(currentUserId(req), workspaceId, input) });
}

export async function getOne(req: Request, res: Response) {
  const { boardId } = boardParams.parse(req.params);
  res.json(await boardsService.getBoard(currentUserId(req), boardId));
}

export async function update(req: Request, res: Response) {
  const { boardId } = boardParams.parse(req.params);
  const input = updateBoardSchema.parse(req.body);
  res.json({ board: await boardsService.updateBoard(currentUserId(req), boardId, input) });
}

// DELETE archives instead of destroying: boards hold history and are easy to restore.
export async function archive(req: Request, res: Response) {
  const { boardId } = boardParams.parse(req.params);
  await boardsService.updateBoard(currentUserId(req), boardId, { archived: true });
  res.status(204).end();
}
