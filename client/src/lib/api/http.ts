// The only place that calls fetch(). Everything else uses the typed functions in this folder.
//
// Auth model (matches the backend):
//  - access token: short-lived JWT, kept IN MEMORY (not localStorage, so XSS can't read it from storage)
//  - refresh token: HttpOnly cookie the browser sends to /auth/refresh; JS never sees it
// On a 401 we refresh once and retry. Page reload => the first thing the app does is refresh.

import type { User } from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "") + "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field-level problems from a 400 VALIDATION_ERROR: [{ path, message }] */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "VALIDATION_ERROR" || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as Array<{ path?: string; message?: string }>) {
      if (d.path && d.message && !(d.path in out)) out[d.path] = d.message;
    }
    return out;
  }
}

// ── Access token storage ──────────────────────────────────────

let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

let onSessionExpired: (() => void) | null = null;
/** AuthProvider registers this so a failed refresh sends the user back to the login page. */
export const setSessionExpiredHandler = (fn: (() => void) | null) => {
  onSessionExpired = fn;
};

// ── Refresh (single-flight) ───────────────────────────────────
//
// The backend ROTATES refresh tokens and treats reuse of an old one as theft (it revokes the whole
// session). So two refresh calls racing with the same cookie would log the user out. We guarantee
// only one refresh runs at a time:
//  - in this tab: all callers share one in-flight promise
//  - across tabs: the Web Locks API serialises them (the second tab then sends the *new* cookie)

interface AuthResponse {
  user: User;
  accessToken: string;
}

let refreshing: Promise<AuthResponse | null> | null = null;

async function doRefresh(): Promise<AuthResponse | null> {
  const run = async (): Promise<AuthResponse | null> => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthResponse;
      setAccessToken(data.accessToken);
      return data;
    } catch {
      return null; // network error: treat as "not signed in"; the user can retry
    }
  };
  return typeof navigator !== "undefined" && "locks" in navigator
    ? navigator.locks.request("task-board-refresh", run)
    : run();
}

export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// ── Core request function ─────────────────────────────────────

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** false for login/register/refresh, which must not trigger the refresh-and-retry logic */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  if (!query) return `${BASE}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | null = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error (proxy down, etc.) */
  }
  const e = body?.error;
  return new ApiError(
    res.status,
    e?.code ?? "HTTP_ERROR",
    e?.message ?? (res.status >= 500 ? "The server had a problem. Try again." : `Request failed (${res.status})`),
    e?.details,
    e?.requestId,
  );
}

async function send(method: string, path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: "include",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");
  }
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(method, path, opts, accessToken);

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      setAccessToken(null);
      onSessionExpired?.();
      throw await parseError(res);
    }
    res = await send(method, path, opts, refreshed.accessToken);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, { ...opts, body }),
  delete: <T = void>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
};
