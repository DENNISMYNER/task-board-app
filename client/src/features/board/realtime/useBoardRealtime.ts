import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Board, BoardData, Column, Comment, MoveColumnResult, MoveTaskResult, PositionChange, Task } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";
import {
  applyBoardUpdated,
  applyColumnMoved,
  applyTaskMoved,
  removeColumn,
  removeTask,
  upsertColumn,
  upsertTask,
} from "../boardCache";
import { refreshTaskInBoard } from "../hooks/syncTask";
import { shouldSkipRealtime } from "./inflight";
import { getSocket } from "./socket";

/** Every event the server sends has this wrapper (see backend src/realtime/index.ts). */
interface Envelope<T> {
  boardId: string;
  actorId: string;
  data: T;
  at: string;
}

type Ack = { ok: true } | { ok: false; error: string };
export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Keeps one board in sync with what other people do.
 *
 * Events are applied to the same query cache the UI renders from, using the same pure functions as
 * optimistic updates. So a remote drag looks exactly like a local one, and applying an event twice
 * (e.g. our own echo) changes nothing.
 */
export function useBoardRealtime(boardId: string): LiveStatus {
  const queryClient = useQueryClient();
  // The status is remembered together with the board it belongs to. Opening another board then
  // reads as "connecting" until that board's own join is acknowledged, without having to call
  // setState synchronously inside the effect.
  const [live, setLive] = useState<{ boardId: string; status: LiveStatus }>({ boardId, status: "connecting" });

  useEffect(() => {
    const setStatus = (status: LiveStatus) => setLive({ boardId, status });
    const socket = getSocket();
    const key = qk.board(boardId);
    let hasConnectedBefore = socket.connected;

    const patch = (fn: (d: BoardData) => BoardData) => queryClient.setQueryData<BoardData>(key, (d) => (d ? fn(d) : d));
    const refetchBoard = () => void queryClient.invalidateQueries({ queryKey: key });
    const knowsColumn = (columnId: string) => queryClient.getQueryData<BoardData>(key)?.columns.some((c) => c.id === columnId) ?? false;
    const touchTask = (taskId: string) => {
      void queryClient.invalidateQueries({ queryKey: qk.taskActivity(taskId) });
    };

    const join = () => {
      socket.emit("board:join", { boardId }, (ack: Ack) => {
        setStatus(ack.ok ? "live" : "offline");
      });
    };

    const onConnect = () => {
      join();
      // We may have missed events while offline: refetch the board (and any open task) to catch up.
      if (hasConnectedBefore) {
        refetchBoard();
        void queryClient.invalidateQueries({ queryKey: ["task"] });
      }
      hasConnectedBefore = true;
    };
    const onDisconnect = () => setStatus("offline");

    const handlers: Record<string, (e: Envelope<never>) => void> = {
      "task:created": (e: Envelope<Task>) => {
        if (!knowsColumn(e.data.columnId)) return refetchBoard();
        patch((d) => upsertTask(d, e.data, { ifNewer: true }));
      },
      "task:updated": (e: Envelope<Task>) => {
        if (shouldSkipRealtime(e.data.id)) return;
        if (!knowsColumn(e.data.columnId)) return refetchBoard();
        patch((d) => upsertTask(d, e.data, { ifNewer: true }));
        queryClient.setQueryData(qk.task(e.data.id), (prev: object | undefined) => (prev ? { ...prev, ...e.data } : prev));
        touchTask(e.data.id);
      },
      "task:moved": (e: Envelope<MoveTaskResult>) => {
        if (shouldSkipRealtime(e.data.task.id)) return;
        if (!knowsColumn(e.data.task.columnId)) return refetchBoard();
        patch((d) => applyTaskMoved(d, e.data));
        touchTask(e.data.task.id);
      },
      "task:deleted": (e: Envelope<{ taskId: string }>) => {
        patch((d) => removeTask(d, e.data.taskId));
        queryClient.removeQueries({ queryKey: qk.task(e.data.taskId) });
      },
      "column:created": (e: Envelope<Column>) => patch((d) => upsertColumn(d, e.data)),
      "column:updated": (e: Envelope<Column>) => patch((d) => upsertColumn(d, e.data)),
      "column:moved": (e: Envelope<MoveColumnResult & { changes: PositionChange[] }>) => patch((d) => applyColumnMoved(d, e.data.changes)),
      "column:deleted": (e: Envelope<{ columnId: string }>) => patch((d) => removeColumn(d, e.data.columnId)),
      "board:updated": (e: Envelope<Board>) => patch((d) => applyBoardUpdated(d, e.data)),
      // Comment events don't carry the new comment count, so refresh the task (idempotent) and its thread.
      "comment:created": (e: Envelope<{ taskId: string; comment: Comment }>) => onComment(e.data.taskId),
      "comment:updated": (e: Envelope<{ taskId: string; comment: Comment }>) => onComment(e.data.taskId),
      "comment:deleted": (e: Envelope<{ taskId: string }>) => onComment(e.data.taskId),
    };

    function onComment(taskId: string) {
      void queryClient.invalidateQueries({ queryKey: qk.comments(taskId) });
      touchTask(taskId);
      refreshTaskInBoard(queryClient, boardId, taskId);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler as (e: unknown) => void);

    if (socket.connected) join();
    else socket.connect(); // `onConnect` joins the room once the handshake succeeds

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler as (e: unknown) => void);
      if (socket.connected) socket.emit("board:leave", { boardId });
    };
  }, [boardId, queryClient]);

  return live.boardId === boardId ? live.status : "connecting";
}
