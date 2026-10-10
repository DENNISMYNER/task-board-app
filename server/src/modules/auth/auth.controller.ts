import type { CookieOptions, Request, Response } from "express";
import { isProd } from "../../config/env";
import { currentUserId } from "../../common/request";
import { loginSchema, registerSchema } from "./auth.schema";
import * as authService from "./auth.service";

// The refresh token lives in an httpOnly cookie: JavaScript (and therefore XSS) can't read it.
// It is scoped to the auth routes so the browser doesn't send it with every API call.
const REFRESH_COOKIE = "refresh_token";
const COOKIE_PATH = "/api/v1/auth";

function cookieOptions(): CookieOptions {
  return { httpOnly: true, secure: isProd, sameSite: "lax", path: COOKIE_PATH };
}

function sessionMeta(req: Request): authService.SessionMeta {
  return { userAgent: req.header("user-agent"), ipAddress: req.ip };
}

function readRefreshToken(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" ? value : undefined;
}

// The access token goes in the JSON body (the SPA keeps it in memory); the refresh token goes in the cookie.
function respondWithSession(res: Response, result: authService.AuthResult, status = 200): void {
  res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions(), expires: result.refreshExpiresAt });
  res.status(status).json({ user: result.user, accessToken: result.accessToken });
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  respondWithSession(res, await authService.register(input, sessionMeta(req)), 201);
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  respondWithSession(res, await authService.login(input, sessionMeta(req)));
}

export async function refresh(req: Request, res: Response) {
  respondWithSession(res, await authService.refresh(readRefreshToken(req), sessionMeta(req)));
}

export async function logout(req: Request, res: Response) {
  await authService.logout(readRefreshToken(req));
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ user: await authService.getMe(currentUserId(req)) });
}
