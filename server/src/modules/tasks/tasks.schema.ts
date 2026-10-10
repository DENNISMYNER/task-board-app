import { z } from "zod";
import { TaskPriority } from "../../generated/prisma/client";

const title = z.string().trim().min(1).max(500);
const description = z.string().max(50_000);
const priority = z.enum(TaskPriority);

// ISO 8601 with an explicit offset ("2026-11-02T09:00:00Z"). Strict on purpose: no ambiguous
// local times and no numbers sneaking in the way `z.coerce.date()` would allow.
const dueDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const createTaskSchema = z.object({
  columnId: z.uuid(),
  title,
  description: description.optional(),
  priority: priority.default("NONE"),
  dueDate: dueDate.nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
});

export const updateTaskSchema = z
  .object({
    // Optimistic concurrency: the version the client last saw. If someone saved in between, we reply 409.
    version: z.number().int().positive(),
    title: title.optional(),
    description: description.nullable().optional(),
    priority: priority.optional(),
    dueDate: dueDate.nullable().optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .refine((body) => Object.keys(body).some((key) => key !== "version"), {
    message: "Provide at least one field to update",
  });

// "Drop this task into column X, directly after task Y" (afterTaskId: null = top of the column).
export const moveTaskSchema = z.object({
  columnId: z.uuid(),
  afterTaskId: z.uuid().nullable(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
