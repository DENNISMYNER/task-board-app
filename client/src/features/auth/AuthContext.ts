import { createContext } from "react";
import type { User } from "../../lib/api";

export type AuthState = { status: "loading" } | { status: "anonymous" } | { status: "authenticated"; user: User };

export interface AuthContextValue {
  state: AuthState;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
