import { http, refreshSession, setAccessToken } from "./http";
import type { User } from "./types";

interface Session {
  user: User;
  accessToken: string;
}

export const authApi = {
  async register(input: { name: string; email: string; password: string }): Promise<User> {
    const res = await http.post<Session>("/auth/register", input, { auth: false });
    setAccessToken(res.accessToken);
    return res.user;
  },

  async login(input: { email: string; password: string }): Promise<User> {
    const res = await http.post<Session>("/auth/login", input, { auth: false });
    setAccessToken(res.accessToken);
    return res.user;
  },

  /** Restores a session from the refresh cookie (used once on page load). null = signed out. */
  async restore(): Promise<User | null> {
    const res = await refreshSession();
    return res?.user ?? null;
  },

  async logout(): Promise<void> {
    try {
      await http.post<void>("/auth/logout", undefined, { auth: false });
    } finally {
      setAccessToken(null);
    }
  },
};
