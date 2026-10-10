import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "./errors";

// Access tokens: short-lived, stateless JWTs sent in the `Authorization: Bearer` header.
export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

/** Returns the user id (the `sub` claim) or throws UnauthorizedError. */
export function verifyAccessToken(token: string): string {
  try {
    // Pin the algorithm so a forged token can't pick its own (e.g. alg: "none").
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.sub) throw new Error("Malformed token");
    return payload.sub;
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}

// Refresh tokens: long-lived, opaque random strings. Only a SHA-256 hash is stored in the DB,
// so a database leak does not hand an attacker working sessions.
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(48).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
