import { useMutation, useQueryClient } from "@tanstack/react-query";
import { boardsApi, columnsApi, tasksApi } from "../../../lib/api";
import type { BoardData, CreateTaskInput, StatusCategory } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import { removeColumn, removeTask, upsertColumn, upsertTask } from "../boardCache";

// Creating things is NOT optimistic: the server assigns the id, the ticket number (ENG-42) and the
// position, so we wait for the answer and then insert it. The realtime echo of the same event is
// harmless because every cache function is an idempotent upsert.

export function useCreateTask(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(boardId, input),
    onSuccess: (task) => {
      queryClient.setQueryData<BoardData>(qk.board(boardId), (d) => d && upsertTask(d, task));
    },
  });
}

export function useDeleteTask(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.remove(taskId),
    onSuccess: (_void, taskId) => {
      queryClient.setQueryData<BoardData>(qk.board(boardId), (d) => d && removeTask(d, taskId));
      queryClient.removeQueries({ queryKey: qk.task(taskId) });
    },
  });
}

export function useCreateColumn(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; category?: StatusCategory }) => columnsApi.create(boardId, input),
    onSuccess: (column) => {
      queryClient.setQueryData<BoardData>(qk.board(boardId), (d) => d && upsertColumn(d, column));
    },
  });
}

export function useUpdateColumn(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { columnId: string; name?: string; category?: StatusCategory; wipLimit?: number | null }) => {
      const { columnId, ...input } = v;
      return columnsApi.update(columnId, input);
    },
    onSuccess: (column) => {
      queryClient.setQueryData<BoardData>(qk.board(boardId), (d) => d && upsertColumn(d, column));
    },
  });
}

export function useDeleteColumn(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (columnId: string) => columnsApi.remove(columnId),
    onSuccess: (_void, columnId) => {
      queryClient.setQueryData<BoardData>(qk.board(boardId), (d) => d && removeColumn(d, columnId));
    },
  });
}

export function useArchiveBoard(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => boardsApi.archive(boardId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.board(boardId) }),
  });
}
