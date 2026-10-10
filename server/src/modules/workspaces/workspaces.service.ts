import { ConflictError } from "../../lib/errors";
import { isUniqueViolation, prisma } from "../../lib/prisma";
import { slugify, withSuffix } from "../../lib/slug";
import { MIN_ROLE, requireMembership } from "../access/access.service";
import { logActivity } from "../activity/activity.service";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "./workspaces.schema";

export async function createWorkspace(userId: string, input: CreateWorkspaceInput) {
  const base = slugify(input.name);

  // The slug is a unique, URL-friendly handle. If "acme" is taken we retry with a random suffix.
  // We rely on the unique index (and catch its error) rather than "check then insert", which would race.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : withSuffix(base);
    try {
      return await prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            name: input.name,
            slug,
            members: { create: { userId, role: "OWNER" } }, // the creator becomes the owner
          },
        });
        await logActivity(tx, {
          workspaceId: workspace.id,
          actorId: userId,
          action: "WORKSPACE_CREATED",
          metadata: { name: workspace.name },
        });
        return { ...workspace, role: "OWNER" as const };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new ConflictError("Could not generate a unique URL for this workspace, try another name", "SLUG_TAKEN");
}

export async function listMyWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map(({ role, workspace }) => ({ ...workspace, role }));
}

export async function getWorkspace(userId: string, workspaceId: string) {
  const access = await requireMembership(userId, workspaceId, MIN_ROLE.read);
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { _count: { select: { members: true, boards: true } } },
  });
  return { ...workspace, role: access.role };
}

export async function updateWorkspace(userId: string, workspaceId: string, input: UpdateWorkspaceInput) {
  const access = await requireMembership(userId, workspaceId, MIN_ROLE.manage);

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.update({
      where: { id: workspaceId },
      data: { name: input.name, logoUrl: input.logoUrl },
    });
    await logActivity(tx, {
      workspaceId,
      actorId: userId,
      action: "WORKSPACE_UPDATED",
      metadata: { changedFields: Object.keys(input) },
    });
    return { ...workspace, role: access.role };
  });
}

/** Soft delete: the data stays in the database (recoverable, audit trail intact) but disappears from the API. */
export async function deleteWorkspace(userId: string, workspaceId: string): Promise<void> {
  await requireMembership(userId, workspaceId, MIN_ROLE.owner);
  await prisma.workspace.update({ where: { id: workspaceId }, data: { deletedAt: new Date() } });
}
