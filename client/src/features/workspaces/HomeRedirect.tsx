import { Navigate, useNavigate } from "react-router";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { Button } from "../../components/ui/Button";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";
import { readLastWorkspace } from "./lastWorkspace";
import { useWorkspaces } from "./hooks";

/** "/" sends you to the workspace you used last, or helps you create your first one. */
export function HomeRedirect() {
  const { data: workspaces, isPending, isError, refetch } = useWorkspaces();
  const navigate = useNavigate();

  if (isPending) return <PageSpinner label="Loading your workspaces" />;
  if (isError) {
    return (
      <EmptyState title="Couldn't load your workspaces" action={<Button onClick={() => void refetch()}>Try again</Button>}>
        Check your connection and try again.
      </EmptyState>
    );
  }

  if (workspaces.length === 0) {
    return (
      <EmptyState title="Create your first workspace">
        <p>A workspace holds your team's boards and members.</p>
        <div className="mt-6 w-full max-w-sm">
          <CreateWorkspaceForm autoFocus onCreated={(w) => void navigate(`/w/${w.id}`, { replace: true })} />
        </div>
      </EmptyState>
    );
  }

  const last = readLastWorkspace();
  const target = workspaces.find((w) => w.id === last) ?? workspaces[0];
  return <Navigate to={`/w/${target?.id}`} replace />;
}
