import type { QueryClient } from "@tanstack/react-query";
import { tasksApi } from "../../../lib/api";
import type { BoardData, Task, TaskDetail } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { upsertTask } from "../boardCache";

/** Keep only the fields a board card needs (TaskDetail carries extra relations). */
export function toCardTask(detail: TaskDetail): Task {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { creator, column, board, ...task } = detail;
  return task;
}

const timers = new Map<string, number>();

/**
 * Re-fetch ONE task and merge it into the board cache. Used when something changes a task's
 * derived data (e.g. its comment count) and the event doesn't carry the new values.
 * Debounced per task so a burst of comments causes one request. Idempotent, unlike "count + 1".
 */
export function refreshTaskInBoard(queryClient: QueryClient, boardId: string, taskId: string): void {
  window.clearTimeout(timers.get(taskId));
  timers.set(
    taskId,
    window.setTimeout(() => {
      timers.delete(taskId);
      tasksApi
        .get(taskId)
        .then((detail) => {
          queryClient.setQueryData(qk.task(taskId), detail);
          queryClient.setQueryData<BoardData>(qk.board(boardId), (prev) => prev && upsertTask(prev, toCardTask(detail), { ifNewer: true }));
        })
        .catch(() => {
          /* the task may have been deleted meanwhile; the next board refetch sorts it out */
        });
    }, 150),
  );
}
