import { z } from "zod";

const body = z.string().trim().min(1, "Comment cannot be empty").max(10_000);

export const createCommentSchema = z.object({
  body,
  // Set to reply to a top-level comment. Threads are one level deep.
  parentId: z.uuid().optional(),
});

export const updateCommentSchema = z.object({ body });

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
