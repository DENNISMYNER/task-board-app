import type { WorkspaceRole } from "./api";

// Mirrors the backend's policy (MIN_ROLE in src/modules/access/access.service.ts).
// The UI uses it to hide actions the server would refuse anyway; the server still enforces every rule.
const RANK: Record<WorkspaceRole, number> = { GUEST: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

/** Create and edit tasks, move cards, edit columns, create boards. */
export const canWrite = (role: WorkspaceRole) => RANK[role] >= RANK.MEMBER;

/** Board settings, deleting columns, managing members. */
export const canManage = (role: WorkspaceRole) => RANK[role] >= RANK.ADMIN;

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  GUEST: "Guest",
};

/** Roles a person with `role` may hand out: strictly below their own (owners can grant anything but owner here). */
export function grantableRoles(role: WorkspaceRole): WorkspaceRole[] {
  if (role === "OWNER") return ["ADMIN", "MEMBER", "GUEST"];
  if (role === "ADMIN") return ["MEMBER", "GUEST"];
  return [];
}
