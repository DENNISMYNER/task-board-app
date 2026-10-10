import type { Request, Response } from "express";
import { currentUserId } from "../../common/request";
import { boardParams, columnParams } from "../../common/schemas";
import { createColumnSchema, moveColumnSchema, updateColumnSchema } from "./columns.schema";
import * as columnsService from "./columns.service";

export async function create(req: Request, res: Response) {
  const { boardId } = boardParams.parse(req.params);
  const input = createColumnSchema.parse(req.body);
  res.status(201).json({ column: await columnsService.createColumn(currentUserId(req), boardId, input) });
}

export async function update(req: Request, res: Response) {
  const { columnId } = columnParams.parse(req.params);
  const input = updateColumnSchema.parse(req.body);
  res.json({ column: await columnsService.updateColumn(currentUserId(req), columnId, input) });
}

export async function move(req: Request, res: Response) {
  const { columnId } = columnParams.parse(req.params);
  const input = moveColumnSchema.parse(req.body);
  res.json(await columnsService.moveColumn(currentUserId(req), columnId, input));
}

export async function remove(req: Request, res: Response) {
  const { columnId } = columnParams.parse(req.params);
  await columnsService.deleteColumn(currentUserId(req), columnId);
  res.status(204).end();
}
