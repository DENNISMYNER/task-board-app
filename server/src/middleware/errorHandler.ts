import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { isProd } from "../config/env";
import { Prisma } from "../generated/prisma/client";
import { AppError } from "../lib/errors";

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  };
  res.status(404).json(body);
};

// Errors raised by body-parser / http-errors carry a numeric `status` (e.g. malformed JSON -> 400).
function isHttpError(e: unknown): e is { status: number; expose?: boolean; message: string; type?: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    typeof (e as { status: unknown }).status === "number"
  );
}

/**
 * The single place where errors become HTTP responses. Every response has the same shape:
 *   { error: { code, message, details?, requestId } }
 * Expected failures (AppError, validation, known DB errors) get a useful message. Anything else
 * is a bug: it is logged with the stack and the client only sees a generic 500.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);
  const send = (status: number, code: string, message: string, details?: unknown) => {
    const body: ErrorBody = { error: { code, message, requestId } };
    if (details !== undefined) body.error.details = details;
    res.status(status).json(body);
  };

  if (err instanceof AppError) {
    return send(err.statusCode, err.code, err.message, err.details);
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return send(400, "VALIDATION_ERROR", "Request validation failed", details);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return send(409, "CONFLICT", "A record with these values already exists", isProd ? undefined : err.meta);
      case "P2003":
        return send(409, "CONFLICT", "The record is referenced by, or references, other records");
      case "P2025":
        return send(404, "NOT_FOUND", "Resource not found");
    }
  }

  if (isHttpError(err) && err.status >= 400 && err.status < 500) {
    const code = err.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST";
    return send(err.status, code, err.expose === false ? "Bad request" : err.message);
  }

  req.log.error({ err }, "Unhandled error");
  return send(500, "INTERNAL_ERROR", "Something went wrong");
};
