import type { Request, Response } from "express";
import { currentUserId } from "../../common/request";
import { workspaceParams } from "../../common/schemas";
import { createWorkspaceSchema, updateWorkspaceSchema } from "./workspaces.schema";
import * as workspacesService from "./workspaces.service";

export async function create(req: Request, res: Response) {
  const input = createWorkspaceSchema.parse(req.body);
  res.status(201).json({ workspace: await workspacesService.createWorkspace(currentUserId(req), input) });
}

export async function listMine(req: Request, res: Response) {
  res.json({ workspaces: await workspacesService.listMyWorkspaces(currentUserId(req)) });
}

export async function getOne(req: Request, res: Response) {
  const { workspaceId } = workspaceParams.parse(req.params);
  res.json({ workspace: await workspacesService.getWorkspace(currentUserId(req), workspaceId) });
}

export async function update(req: Request, res: Response) {
  const { workspaceId } = workspaceParams.parse(req.params);
  const input = updateWorkspaceSchema.parse(req.body);
  res.json({ workspace: await workspacesService.updateWorkspace(currentUserId(req), workspaceId, input) });
}

export async function remove(req: Request, res: Response) {
  const { workspaceId } = workspaceParams.parse(req.params);
  await workspacesService.deleteWorkspace(currentUserId(req), workspaceId);
  res.status(204).end();
}
