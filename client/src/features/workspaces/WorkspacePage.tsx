import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import type { BoardListItem } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { canWrite } from "../../lib/roles";
import { CreateBoardDialog } from "./CreateBoardDialog";
import { MembersDialog } from "./MembersDialog";
import { useMembers, useWorkspaceBoards, useWorkspaces } from "./hooks";

/** Workspace home: every board in the workspace, who is in it, and a way to start a new board. */
export function WorkspacePage() {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  const boards = useWorkspaceBoards(workspaceId);
  const members = useMembers(workspaceId);
  const [creating, setCreating] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  if (workspaces.isPending) return <PageSpinner label="Loading workspace" />;

  const workspace = workspaces.data?.find((w) => w.id === workspaceId);
  if (!workspace) {
    return (
      <EmptyState title="Workspace not found" action={<Link to="/" className="font-medium text-accent hover:underline">Go to your workspaces</Link>}>
        It may have been deleted, or you may not be a member of it.
      </EmptyState>
    );
  }

  const writable = canWrite(workspace.role);
  const people = members.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold break-words sm:text-4xl">{workspace.name}</h1>
          <p className="mt-1 text-muted">
            {boards.data ? `${boards.data.length} ${boards.data.length === 1 ? "board" : "boards"}` : "Boards"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowMembers(true)}>
            <span className="flex -space-x-1.5" aria-hidden>
              {people.slice(0, 3).map((m) => (
                <Avatar key={m.id} person={m.user} size={20} className="ring-2 ring-raised" />
              ))}
            </span>
            {people.length === 0 && <Users className="size-4" aria-hidden />}
            People
          </Button>
          {writable && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> New board
            </Button>
          )}
        </div>
      </header>

      <section aria-label="Boards" className="mt-8">
        {boards.isPending && <PageSpinner label="Loading boards" />}
        {boards.isError && (
          <p className="text-muted">
            Couldn't load the boards. <button className="font-medium text-accent hover:underline" onClick={() => void boards.refetch()}>Try again</button>
          </p>
        )}
        {boards.data && boards.data.length === 0 && (
          <EmptyState
            title="No boards yet"
            action={writable ? <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /> Create a board</Button> : undefined}
          >
            {writable ? "A board tracks one project: columns for each stage, cards for each task." : "Ask a member to create a board."}
          </EmptyState>
        )}
        {boards.data && boards.data.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-col border border-line bg-raised">
            {boards.data.map((board) => (
              <BoardRow key={board.id} board={board} to={`/w/${workspaceId}/boards/${board.id}`} />
            ))}
          </ul>
        )}
      </section>

      {writable && (
        <CreateBoardDialog
          workspaceId={workspaceId}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(board) => {
            setCreating(false);
            void navigate(`/w/${workspaceId}/boards/${board.id}`);
          }}
        />
      )}
      <MembersDialog workspaceId={workspaceId} workspaceName={workspace.name} myRole={workspace.role} open={showMembers} onClose={() => setShowMembers(false)} />
    </div>
  );
}

function BoardRow({ board, to }: { board: BoardListItem; to: string }) {
  const count = board._count.tasks;
  return (
    <li>
      <Link to={to} className="flex items-center gap-4 px-4 py-3.5 hover:bg-ink/[0.03] focus-visible:-outline-offset-2">
        {/* The key is what the board's task ids start with, so it doubles as the board's identity. */}
        <span className="grid size-11 shrink-0 place-items-center rounded-card border border-line-strong bg-surface font-display text-[15px] font-semibold tracking-wide">
          {board.key}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{board.name}</span>
          {board.description && <span className="block truncate text-[13px] text-muted">{board.description}</span>}
        </span>
        <span className="hidden shrink-0 text-right text-[13px] text-muted sm:block">
          <span className="block">{count} {count === 1 ? "task" : "tasks"}</span>
          <span className="block">Updated {relativeTime(board.updatedAt)}</span>
        </span>
      </Link>
    </li>
  );
}
