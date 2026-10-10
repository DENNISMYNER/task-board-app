import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, commentsApi, tasksApi } from "../../lib/api";
import type { BoardData, Task, UpdateTaskInput } from "../../lib/api";
import { qk } from "../../lib/queryKeys";
import { findTask, upsertTask } from "../board/boardCache";
import { refreshTaskInBoard } from "../board/hooks/syncTask";

export interface UpdateTaskVars {
  input: UpdateTaskInput;
  /**
   * Fields to show immediately, before the server answers (a select that snaps back for 200ms
   * feels broken). Rolled back automatically if the request fails.
   */
  optimistic?: Partial<Task>;
  /**
   * For independent fields (priority, assignee, due date): if somebody else saved a *different*
   * field first, retry once on top of their version instead of bothering the user with a conflict.
   * Don't use it for text edits, where silently overwriting someone's words would be wrong.
   */
  retryOnConflict?: boolean;
}

/** On a 409 the server includes the task as it is now, so the client can recover without a round trip. */
export function conflictingTask(err: unknown): Task | null {
  if (!(err instanceof ApiError) || err.code !== "VERSION_CONFLICT") return null;
  const current = (err.details as { current?: Task } | undefined)?.current;
  return current && typeof current.version === "number" ? current : null;
}

/** Edit a task. The board cache is the single source of truth the drawer reads from. */
export function useUpdateTask(boardId: string, taskId: string) {
  const queryClient = useQueryClient();
  const key = qk.board(boardId);

  return useMutation({
    mutationFn: async ({ input, retryOnConflict }: UpdateTaskVars) => {
      try {
        return await tasksApi.update(taskId, input);
      } catch (err) {
        const current = conflictingTask(err);
        if (retryOnConflict && current) return tasksApi.update(taskId, { ...input, version: current.version });
        throw err;
      }
    },
    onMutate: ({ optimistic }) => {
      const before = queryClient.getQueryData<BoardData>(key);
      const task = before && findTask(before, taskId)?.task;
      if (!task || !optimistic) return { previous: undefined };
      queryClient.setQueryData<BoardData>(key, (d) => d && upsertTask(d, { ...task, ...optimistic }));
      return { previous: task };
    },
    onError: (err, _vars, context) => {
      // Show the truth again: the server's current task after a conflict, otherwise what we had before.
      const truth = conflictingTask(err) ?? context?.previous;
      if (truth) queryClient.setQueryData<BoardData>(key, (d) => d && upsertTask(d, truth));
    },
    onSuccess: (task) => {
      queryClient.setQueryData<BoardData>(key, (d) => d && upsertTask(d, task));
      void queryClient.invalidateQueries({ queryKey: qk.taskActivity(taskId) });
    },
  });
}

export function useComments(taskId: string) {
  return useQuery({ queryKey: qk.comments(taskId), queryFn: () => commentsApi.list(taskId) });
}

/** One hook for create / edit / delete: every comment change refreshes the thread, the feed and the card's count. */
export function useCommentMutations(boardId: string, taskId: string) {
  const queryClient = useQueryClient();
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: qk.comments(taskId) });
    void queryClient.invalidateQueries({ queryKey: qk.taskActivity(taskId) });
    refreshTaskInBoard(queryClient, boardId, taskId);
  };
  return {
    create: useMutation({
      mutationFn: (input: { body: string; parentId?: string }) => commentsApi.create(taskId, input),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: (v: { commentId: string; body: string }) => commentsApi.update(v.commentId, v.body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (commentId: string) => commentsApi.remove(commentId), onSuccess: done }),
  };
}

export function useTaskActivity(taskId: string) {
  return useInfiniteQuery({
    queryKey: qk.taskActivity(taskId),
    queryFn: ({ pageParam }) => tasksApi.activity(taskId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
