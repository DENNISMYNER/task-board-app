import type { Request, Response } from "express";
import { currentUserId } from "../../common/request";
import { memberParams, workspaceParams } from "../../common/schemas";
import { addMemberSchema, updateMemberSchema } from "./members.schema";
import * as membersService from "./members.service";

export async function list(req: Request, res: Response) {
  const { workspaceId } = workspaceParams.parse(req.params);
  res.json({ members: await membersService.listMembers(currentUserId(req), workspaceId) });
}

export async function add(req: Request, res: Response) {
  const { workspaceId } = workspaceParams.parse(req.params);
  const input = addMemberSchema.parse(req.body);
  res.status(201).json({ member: await membersService.addMember(currentUserId(req), workspaceId, input) });
}

export async function changeRole(req: Request, res: Response) {
  const { workspaceId, userId } = memberParams.parse(req.params);
  const input = updateMemberSchema.parse(req.body);
  res.json({ member: await membersService.changeMemberRole(currentUserId(req), workspaceId, userId, input) });
}

export async function remove(req: Request, res: Response) {
  const { workspaceId, userId } = memberParams.parse(req.params);
  await membersService.removeMember(currentUserId(req), workspaceId, userId);
  res.status(204).end();
}
