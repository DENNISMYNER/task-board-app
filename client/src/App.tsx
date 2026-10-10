import { Link, Navigate, Route, Routes } from "react-router";
import { EmptyState } from "./components/ui/EmptyState";
import { LoginPage, RegisterPage } from "./features/auth/AuthPages";
import { RequireAuth } from "./features/auth/RequireAuth";
import { BoardPage } from "./features/board/BoardPage";
import { AppShell } from "./features/shell/AppShell";
import { HomeRedirect } from "./features/workspaces/HomeRedirect";
import { WorkspacePage } from "./features/workspaces/WorkspacePage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Everything below needs a signed-in user; RequireAuth sends everyone else to /login. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomeRedirect />} />
          <Route path="w/:workspaceId" element={<WorkspacePage />} />
          <Route path="w/:workspaceId/boards/:boardId" element={<BoardPage />} />
          <Route
            path="*"
            element={
              <EmptyState title="Page not found" action={<Link to="/" className="font-medium text-accent hover:underline">Go to your workspaces</Link>}>
                That address doesn't lead anywhere.
              </EmptyState>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
