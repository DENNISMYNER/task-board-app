import { Navigate, Outlet, useLocation } from "react-router";
import { PageSpinner } from "../../components/ui/Spinner";
import { useAuth } from "./useAuth";

/** Route guard: renders the nested routes only for signed-in users. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <PageSpinner label="Restoring your session" />;
  if (state.status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
