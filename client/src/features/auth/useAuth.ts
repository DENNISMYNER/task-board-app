import { useContext } from "react";
import { AuthContext } from "./AuthContext";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For components that only render when signed in (everything behind <RequireAuth>). */
export function useCurrentUser() {
  const { state } = useAuth();
  if (state.status !== "authenticated") throw new Error("useCurrentUser used while signed out");
  return state.user;
}
