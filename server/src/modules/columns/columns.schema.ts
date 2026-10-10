import { z } from "zod";
import { StatusCategory } from "../../generated/prisma/client";

const name = z.string().trim().min(1).max(80);
const category = z.enum(StatusCategory);
const wipLimit = z.number().int().min(1).max(1000).nullable();

export const createColumnSchema = z.object({
  name,
  category: category.default("UNSTARTED"),
  wipLimit: wipLimit.optional(),
});

export const updateColumnSchema = z
  .object({
    name: name.optional(),
    category: category.optional(),
    wipLimit: wipLimit.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Provide at least one field to update" });

// `afterColumnId: null` means "make it the first column". The key is required on purpose, so a
// forgotten field is a clear 400 instead of silently moving the column to the front.
export const moveColumnSchema = z.object({ afterColumnId: z.uuid().nullable() });

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type MoveColumnInput = z.infer<typeof moveColumnSchema>;
