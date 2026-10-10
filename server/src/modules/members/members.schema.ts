import { z } from "zod";
import { emailField } from "../../common/schemas";
import { WorkspaceRole } from "../../generated/prisma/client";

const role = z.enum(WorkspaceRole);

export const addMemberSchema = z.object({
  email: emailField,
  role: role.default("MEMBER"),
});

export const updateMemberSchema = z.object({ role });

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
