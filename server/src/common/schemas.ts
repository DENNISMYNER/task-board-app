import { z } from "zod";

// Route parameters are validated as UUIDs before they reach the database. Without this an
// invalid id would surface as a confusing Prisma error (a 500) instead of a clean 400.
const id = z.uuid();

export const workspaceParams = z.object({ workspaceId: id });
export const memberParams = z.object({ workspaceId: id, userId: id });
export const boardParams = z.object({ boardId: id });
export const columnParams = z.object({ columnId: id });
export const taskParams = z.object({ taskId: id });
export const commentParams = z.object({ commentId: id });

// Normalise before validating so "  Ada@Example.COM " and "ada@example.com" are the same account.
export const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254));

// Cursor pagination for append-only feeds (activity). The cursor is the last id the client saw.
export const cursorQuery = z.object({
  cursor: z.string().regex(/^\d+$/, "cursor must be a numeric id").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
