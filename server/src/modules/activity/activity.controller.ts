import type { Request, Response } from "express";
import { currentUserId } from "../../common/request";
import { boardParams, cursorQuery, taskParams } from "../../common/schemas";
import * as activityService from "./activity.service";

export async function listForBoard(req: Request, res: Response) {
  const { boardId } = boardParams.parse(req.params);
  const query = cursorQuery.parse(req.query);
  res.json(await activityService.listBoardActivity(currentUserId(req), boardId, query));
}

export async function listForTask(req: Request, res: Response) {
  const { taskId } = taskParams.parse(req.params);
  const query = cursorQuery.parse(req.query);
  res.json(await activityService.listTaskActivity(currentUserId(req), taskId, query));
}
