import { http } from "./http";
import type { ActivityPage, CreateTaskInput, MoveTaskResult, Task, TaskDetail, UpdateTaskInput } from "./types";

export const tasksApi = {
  create: (boardId: string, input: CreateTaskInput) =>
    http.post<{ task: Task }>(`/boards/${boardId}/tasks`, input).then((r) => r.task),
  get: (taskId: string) => http.get<{ task: TaskDetail }>(`/tasks/${taskId}`).then((r) => r.task),
  update: (taskId: string, input: UpdateTaskInput) =>
    http.patch<{ task: Task }>(`/tasks/${taskId}`, input).then((r) => r.task),
  /** Drag and drop: "put this task in `columnId`, directly after `afterTaskId`" (null = top of the column). */
  move: (taskId: string, input: { columnId: string; afterTaskId: string | null }) =>
    http.post<MoveTaskResult>(`/tasks/${taskId}/move`, input),
  remove: (taskId: string) => http.delete(`/tasks/${taskId}`),
  activity: (taskId: string, cursor?: string) =>
    http.get<ActivityPage>(`/tasks/${taskId}/activity`, { query: { cursor, limit: 30 } }),
};
