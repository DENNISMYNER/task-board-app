import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { authApi, setSessionExpiredHandler } from "../../lib/api";
import { disconnectSocket } from "../board/realtime/socket";
import { AuthContext } from "./AuthContext";
import type { AuthContextValue, AuthState } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    // If a refresh fails mid-session (token revoked, expired cookie), drop everything and show the login page.
    setSessionExpiredHandler(() => {
      disconnectSocket();
      queryClient.clear();
      setState({ status: "anonymous" });
    });

    // Page load: try to restore the session from the HttpOnly refresh cookie.
    void authApi.restore().then((user) => {
      if (!cancelled) setState(user ? { status: "authenticated", user } : { status: "anonymous" });
    });

    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, [queryClient]);

  const login = useCallback<AuthContextValue["login"]>(
    async (input) => {
      const user = await authApi.login(input);
      queryClient.clear(); // never show the previous user's cached data
      setState({ status: "authenticated", user });
    },
    [queryClient],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (input) => {
      const user = await authApi.register(input);
      queryClient.clear();
      setState({ status: "authenticated", user });
    },
    [queryClient],
  );

  const logout = useCallback<AuthContextValue["logout"]>(async () => {
    try {
      await authApi.logout();
    } finally {
      disconnectSocket();
      queryClient.clear();
      setState({ status: "anonymous" });
    }
  }, [queryClient]);

  const value = useMemo(() => ({ state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
