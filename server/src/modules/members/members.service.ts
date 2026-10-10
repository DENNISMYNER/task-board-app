import type { Prisma, WorkspaceRole } from "../../generated/prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { isUniqueViolation, prisma, type Db } from "../../lib/prisma";
import { removeUserFromBoards } from "../../realtime";
import { hasRole, MIN_ROLE, requireMembership, roleRank } from "../access/access.service";
import { logActivity } from "../activity/activity.service";
import type { AddMemberInput, UpdateMemberInput } from "./members.schema";

const memberSelect = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true } },
} satisfies Prisma.WorkspaceMemberSelect;

/**
 * Role-granting rule: owners can grant anything; everyone else can only grant roles strictly
 * below their own. This stops an admin from minting more admins/owners (privilege escalation).
 */
function assertCanGrant(actorRole: WorkspaceRole, granted: WorkspaceRole): void {
  if (actorRole === "OWNER") return;
  if (roleRank(granted) >= roleRank(actorRole)) {
    throw new ForbiddenError("You can only assign roles lower than your own");
  }
}

/** A workspace must never end up without an owner. */
async function assertAnotherOwnerExists(db: Db, workspaceId: string, excludingUserId: string) {
  const others = await db.workspaceMember.count({
    where: { workspaceId, role: "OWNER", userId: { not: excludingUserId } },
  });
  if (others === 0) throw new ConflictError("A workspace must keep at least one owner", "LAST_OWNER");
}

export async function listMembers(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId, MIN_ROLE.read);
  return prisma.workspaceMember.findMany({
    where: { workspaceId, user: { deletedAt: null } },
    select: memberSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function addMember(actorId: string, workspaceId: string, input: AddMemberInput) {
  const actor = await requireMembership(actorId, workspaceId, MIN_ROLE.manage);
  assertCanGrant(actor.role, input.role);

  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { id: true },
  });
  // Email invitations (WorkspaceInvite) are the next step; for now the person must already have an account.
  if (!user) throw new NotFoundError("No registered user with that email address");

  try {
    return await prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.create({
        data: { workspaceId, userId: user.id, role: input.role },
        select: memberSelect,
      });
      await logActivity(tx, {
        workspaceId,
        actorId,
        action: "MEMBER_ADDED",
        metadata: { userId: user.id, role: input.role },
      });
      return member;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("That user is already a member", "ALREADY_MEMBER");
    throw err;
  }
}

export async function changeMemberRole(
  actorId: string,
  workspaceId: string,
  targetUserId: string,
  input: UpdateMemberInput,
) {
  const actor = await requireMembership(actorId, workspaceId, MIN_ROLE.manage);

  return prisma.$transaction(async (tx) => {
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundError("Member not found");

    if (actor.role !== "OWNER") {
      if (roleRank(target.role) >= roleRank(actor.role)) {
        throw new ForbiddenError("You can only manage members with a lower role than yours");
      }
      assertCanGrant(actor.role, input.role);
    }
    if (target.role === "OWNER" && input.role !== "OWNER") {
      await assertAnotherOwnerExists(tx, workspaceId, targetUserId);
    }

    const member = await tx.workspaceMember.update({
      where: { id: target.id },
      data: { role: input.role },
      select: memberSelect,
    });
    await logActivity(tx, {
      workspaceId,
      actorId,
      action: "MEMBER_ROLE_CHANGED",
      metadata: { userId: targetUserId, from: target.role, to: input.role },
    });
    return member;
  });
}

/** Admins remove others; anyone can remove themselves ("leave workspace"). */
export async function removeMember(actorId: string, workspaceId: string, targetUserId: string): Promise<void> {
  const actor = await requireMembership(actorId, workspaceId, MIN_ROLE.read);
  const isSelf = actorId === targetUserId;
  if (!isSelf && !hasRole(actor.role, MIN_ROLE.manage)) throw new ForbiddenError();

  await prisma.$transaction(async (tx) => {
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundError("Member not found");

    if (!isSelf && actor.role !== "OWNER" && roleRank(target.role) >= roleRank(actor.role)) {
      throw new ForbiddenError("You can only remove members with a lower role than yours");
    }
    if (target.role === "OWNER") await assertAnotherOwnerExists(tx, workspaceId, targetUserId);

    // Don't leave tasks assigned to someone who can no longer see them.
    await tx.task.updateMany({
      where: { assigneeId: targetUserId, board: { workspaceId } },
      data: { assigneeId: null },
    });
    await tx.workspaceMember.delete({ where: { id: target.id } });
    await logActivity(tx, {
      workspaceId,
      actorId,
      action: "MEMBER_REMOVED",
      metadata: { userId: targetUserId, left: isSelf },
    });
  });

  // After commit: drop the removed user's live sockets from this workspace's board rooms.
  const boards = await prisma.board.findMany({ where: { workspaceId }, select: { id: true } });
  removeUserFromBoards(targetUserId, boards.map((b) => b.id));
}
