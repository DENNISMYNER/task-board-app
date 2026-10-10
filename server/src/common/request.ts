import type { Request } from "express";
import { UnauthorizedError } from "../lib/errors";

/** The authenticated user's id. Only valid on routes behind the `authenticate` middleware. */
export function currentUserId(req: Request): string {
  if (!req.userId) throw new UnauthorizedError();
  return req.userId;
}
