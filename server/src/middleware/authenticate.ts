import type { RequestHandler } from "express";
import { UnauthorizedError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";

/**
 * Requires `Authorization: Bearer <access token>` and attaches the user id to `req.userId`.
 * Errors thrown here are caught by Express and routed to the error handler.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedError();
  req.userId = verifyAccessToken(header.slice("Bearer ".length).trim());
  next();
};
