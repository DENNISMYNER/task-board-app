import { z } from "zod";

const name = z.string().trim().min(1).max(120);

export const createBoardSchema = z.object({
  name,
  // Short prefix used for human-friendly task ids: key "ENG" -> ENG-1, ENG-2, ...
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key must be 2-10 letters or digits and start with a letter"),
  description: z.string().trim().max(5000).optional(),
});

export const updateBoardSchema = z
  .object({
    name: name.optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Provide at least one field to update" });

export const listBoardsQuery = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
