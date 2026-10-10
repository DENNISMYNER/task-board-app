import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { columnsApi, tasksApi } from "../../../lib/api";
import type { BoardData } from "../../../lib/api";
import { errorMessage } from "../../../lib/errors";
import { qk } from "../../../lib/queryKeys";
import { useToast } from "../../../components/ui/Toast";
import {
  applyColumnMoved,
  applyOptimisticColumnMove,
  applyOptimisticTaskMove,
  applyTaskMoved,
  findTask,
  upsertTask,
} from "../boardCache";
import { beginMove, endMove } from "../realtime/inflight";

/**
 * Optimistic task move.
 *
 *  1. Update the cache SYNCHRONOUSLY, so the card is already in its new place on the next paint.
 *  2. Ask the server. Its answer carries the real position (and any renumbering), which replaces our guess.
 *  3. If the request fails, put the card back and refetch to be sure we show the truth.
 *
 * The function is deliberately not async-before-update: awaiting anything first would leave a frame
 * where the card visibly jumps back to its old spot after the drop.
 */
export function useMoveTask(boardId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = qk.board(boardId);

  return useCallback(
    (move: { taskId: string; columnId: string; afterTaskId: string | null }) => {
      const before = queryClient.getQueryData<BoardData>(key);
      const original = before && findTask(before, move.taskId)?.task;
      if (!before || !original) return;

      // revert:false => cancelling a background refetch must not roll the cache back over our update.
      void queryClient.cancelQueries({ queryKey: key }, { revert: false });
      beginMove(move.taskId);
      queryClient.setQueryData<BoardData>(key, (d) => d && applyOptimisticTaskMove(d, move));

      tasksApi
        .move(move.taskId, { columnId: move.columnId, afterTaskId: move.afterTaskId })
        .then((result) => {
          queryClient.setQueryData<BoardData>(key, (d) => d && applyTaskMoved(d, result));
          void queryClient.invalidateQueries({ queryKey: qk.taskActivity(move.taskId) });
        })
        .catch((err: unknown) => {
          queryClient.setQueryData<BoardData>(key, (d) => d && upsertTask(d, original)); // put it back
          void queryClient.invalidateQueries({ queryKey: key });
          toast({ title: "Couldn't move the task", description: errorMessage(err), tone: "error" });
        })
        .finally(() => {
          // If a realtime event about this task was ignored while we were moving it, resync now.
          if (endMove(move.taskId)) void queryClient.invalidateQueries({ queryKey: key });
        });
    },
    [queryClient, key, toast],
  );
}

/** Optimistic column reorder. Same three steps as useMoveTask. */
export function useMoveColumn(boardId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = qk.board(boardId);

  return useCallback(
    (move: { columnId: string; afterColumnId: string | null }) => {
      const before = queryClient.getQueryData<BoardData>(key);
      if (!before) return;

      void queryClient.cancelQueries({ queryKey: key }, { revert: false });
      queryClient.setQueryData<BoardData>(key, (d) => d && applyOptimisticColumnMove(d, move));

      columnsApi
        .move(move.columnId, move.afterColumnId)
        .then((result) => {
          queryClient.setQueryData<BoardData>(key, (d) => d && applyColumnMoved(d, result.changes));
        })
        .catch((err: unknown) => {
          queryClient.setQueryData<BoardData>(key, (d) => d && { ...d, columns: before.columns.map((c) => d.columns.find((x) => x.id === c.id) ?? c) });
          void queryClient.invalidateQueries({ queryKey: key });
          toast({ title: "Couldn't move the column", description: errorMessage(err), tone: "error" });
        });
    },
    [queryClient, key, toast],
  );
}
