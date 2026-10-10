import { z } from "zod";

const name = z.string().trim().min(1).max(120);

export const createWorkspaceSchema = z.object({ name });

export const updateWorkspaceSchema = z
  .object({
    name: name.optional(),
    logoUrl: z.url().max(2048).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Provide at least one field to update" });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
