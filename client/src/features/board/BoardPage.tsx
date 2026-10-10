import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "../../components/ui/Button";
import { cn } from "../../components/ui/cn";
import { Dialog } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { Menu, MenuItem } from "../../components/ui/Menu";
import { PageSpinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import { ApiError, boardsApi } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { qk } from "../../lib/queryKeys";
import { canManage, canWrite } from "../../lib/roles";
import { useCurrentUser } from "../auth/useAuth";
import { TaskDrawer } from "../tasks/TaskDrawer";
import { useMembers } from "../workspaces/hooks";
import { findTask } from "./boardCache";
import { BoardView } from "./components/BoardView";
import { useBoard } from "./hooks/useBoard";
import { useArchiveBoard } from "./hooks/useBoardMutations";
import { useMoveColumn, useMoveTask } from "./hooks/useMoves";
import { useBoardRealtime } from "./realtime/useBoardRealtime";
import type { LiveStatus } from "./realtime/useBoardRealtime";

export function BoardPage() {
  const { workspaceId = "", boardId = "" } = useParams();
  // Keyed by board so switching boards starts from a clean slate (drawer, drag state, socket room).
  return <BoardScreen key={boardId} workspaceId={workspaceId} boardId={boardId} />;
}

function BoardScreen({ workspaceId, boardId }: { workspaceId: string; boardId: string }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isPending, isError, error, refetch } = useBoard(boardId);
  const live = useBoardRealtime(boardId);
  const moveTask = useMoveTask(boardId);
  const moveColumn = useMoveColumn(boardId);
  const members = useMembers(data?.board.workspaceId);
  const archive = useArchiveBoard(boardId);

  const [params, setParams] = useSearchParams();
  const taskId = params.get("task");
  const [confirmArchive, setConfirmArchive] = useState(false);

  const restore = useMutation({
    mutationFn: () => boardsApi.update(boardId, { archived: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.board(boardId) });
      void queryClient.invalidateQueries({ queryKey: qk.boards(workspaceId) });
      toast({ title: "Board restored", tone: "success" });
    },
    onError: (err) => toast({ title: "Couldn't restore the board", description: errorMessage(err), tone: "error" }),
  });

  // The open task lives in the URL (?task=…), so it can be linked to and Back closes it.
  const openTask = useCallback((id: string) => setParams({ task: id }), [setParams]);
  const closeTask = useCallback(() => {
    if (taskId) setParams({}, { replace: true });
  }, [taskId, setParams]);

  const openTaskData = data && taskId ? findTask(data, taskId)?.task : undefined;
  const hasOpenTask = openTaskData !== undefined;
  const seenTask = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !taskId) {
      seenTask.current = null;
      return;
    }
    if (hasOpenTask) {
      seenTask.current = taskId;
      return;
    }
    // The URL points at a task that isn't on this board (deleted by someone, or a stale link).
    toast({ title: seenTask.current === taskId ? "This task was deleted" : "That task isn't on this board" });
    seenTask.current = null;
    closeTask();
  }, [data, taskId, hasOpenTask, closeTask, toast]);

  if (isPending) return <PageSpinner label="Loading board" />;
  if (isError) {
    const gone = error instanceof ApiError && (error.status === 404 || error.status === 403);
    return gone ? (
      <EmptyState title="Board not found" action={<Link to="/" className="font-medium text-accent hover:underline">Back to your workspaces</Link>}>
        It may have been deleted, or you may not have access to it.
      </EmptyState>
    ) : (
      <EmptyState title="Couldn't load this board" action={<Button onClick={() => void refetch()}>Try again</Button>}>
        {errorMessage(error)}
      </EmptyState>
    );
  }

  // A link with the wrong workspace in it: send it to the right place instead of showing a mismatch.
  if (data.board.workspaceId !== workspaceId) {
    return <Navigate to={`/w/${data.board.workspaceId}/boards/${boardId}${taskId ? `?task=${taskId}` : ""}`} replace />;
  }

  const { board, role } = data;
  const archived = board.archivedAt !== null;
  const writable = canWrite(role) && !archived;
  const manageable = canManage(role);
  const taskCount = data.columns.reduce((sum, c) => sum + c.tasks.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-6">
        <Link
          to={`/w/${workspaceId}`}
          aria-label="Back to boards"
          className="grid size-10 shrink-0 place-items-center rounded-card border border-line-strong bg-surface font-display text-sm font-semibold tracking-wide hover:border-accent"
        >
          {board.key}
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl leading-tight font-semibold">{board.name}</h1>
          <p className="text-[13px] text-muted">
            {taskCount} {taskCount === 1 ? "task" : "tasks"}
            {board.description ? `. ${board.description}` : ""}
          </p>
        </div>
        <LiveBadge status={live} />
        {manageable && !archived && (
          <Menu label="Board options" triggerLabel="Board options" align="right" triggerClassName="grid size-8 place-items-center rounded-md text-muted hover:bg-ink/5 hover:text-ink" trigger={<MoreHorizontal className="size-5" aria-hidden />}>
            {(close) => (
              <MenuItem
                tone="danger"
                onSelect={() => {
                  close();
                  setConfirmArchive(true);
                }}
              >
                Archive board…
              </MenuItem>
            )}
          </Menu>
        )}
      </header>

      {archived && (
        <div role="status" className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-card border border-line-strong bg-surface px-4 py-2.5 text-sm sm:mx-6">
          <p className="flex-1">This board is archived. You can read it, but nothing can be changed.</p>
          {manageable && (
            <Button size="sm" loading={restore.isPending} onClick={() => restore.mutate()}>
              Restore board
            </Button>
          )}
        </div>
      )}

      <BoardView data={data} canWrite={writable} canManage={manageable && !archived} onMoveTask={moveTask} onMoveColumn={moveColumn} onOpenTask={openTask} />

      <TaskDrawer
        boardId={boardId}
        boardKey={board.key}
        task={openTaskData}
        columns={data.columns}
        members={members.data ?? []}
        currentUserId={user.id}
        canWrite={writable}
        canManage={manageable}
        onClose={closeTask}
        onMove={moveTask}
      />

      <Dialog open={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive this board?">
        <div className="flex flex-col gap-4 p-5">
          <p className="text-muted">“{board.name}” disappears from the workspace and becomes read-only. An admin can restore it later.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmArchive(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={archive.isPending}
              onClick={() =>
                archive.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmArchive(false);
                    void queryClient.invalidateQueries({ queryKey: qk.boards(workspaceId) });
                    toast({ title: "Board archived", tone: "success" });
                    void navigate(`/w/${workspaceId}`);
                  },
                  onError: (err) => toast({ title: "Couldn't archive the board", description: errorMessage(err), tone: "error" }),
                })
              }
            >
              Archive board
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

const LIVE_TEXT: Record<LiveStatus, { label: string; hint: string; dot: string }> = {
  live: { label: "Live", hint: "Changes from your teammates appear as they happen.", dot: "bg-done" },
  connecting: { label: "Connecting", hint: "Connecting for live updates.", dot: "bg-warn animate-pulse" },
  offline: { label: "Offline", hint: "Live updates are paused. We'll reconnect and catch up automatically.", dot: "bg-signal" },
};

function LiveBadge({ status }: { status: LiveStatus }) {
  const { label, hint, dot } = LIVE_TEXT[status];
  return (
    <p role="status" title={hint} className="inline-flex items-center gap-1.5 text-[13px] text-muted">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {label}
      <span className="sr-only">. {hint}</span>
    </p>
  );
}
