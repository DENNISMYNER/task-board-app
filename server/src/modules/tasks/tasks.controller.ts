import type { Request, Response } from "express";
import { currentUserId } from "../../common/request";
import { boardParams, taskParams } from "../../common/schemas";
import { createTaskSchema, moveTaskSchema, updateTaskSchema } from "./tasks.schema";
import * as tasksService from "./tasks.service";

export async function create(req: Request, res: Response) {
  const { boardId } = boardParams.parse(req.params);
  const input = createTaskSchema.parse(req.body);
  res.status(201).json({ task: await tasksService.createTask(currentUserId(req), boardId, input) });
}

export async function getOne(req: Request, res: Response) {
  const { taskId } = taskParams.parse(req.params);
  res.json({ task: await tasksService.getTask(currentUserId(req), taskId) });
}

export async function update(req: Request, res: Response) {
  const { taskId } = taskParams.parse(req.params);
  const input = updateTaskSchema.parse(req.body);
  res.json({ task: await tasksService.updateTask(currentUserId(req), taskId, input) });
}

export async function move(req: Request, res: Response) {
  const { taskId } = taskParams.parse(req.params);
  const input = moveTaskSchema.parse(req.body);
  res.json(await tasksService.moveTask(currentUserId(req), taskId, input));
}

export async function remove(req: Request, res: Response) {
  const { taskId } = taskParams.parse(req.params);
  await tasksService.deleteTask(currentUserId(req), taskId);
  res.status(204).end();
}
