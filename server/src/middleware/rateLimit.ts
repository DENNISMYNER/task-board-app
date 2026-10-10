import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";

const body = (message: string) => ({ error: { code: "RATE_LIMITED", message } });
const skip = () => env.NODE_ENV === "test";

// Generous limit for the whole API: stops runaway clients, not normal usage.
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: body("Too many requests, slow down."),
  skip,
});

// Brute-force protection for login and token refresh. Only FAILED attempts count
// (`skipSuccessfulRequests`): the SPA calls /auth/refresh on every page load, so counting successes
// would lock out a developer who reloads a few times, or a whole office sharing one IP.
// (Counts per IP. For production also consider per-account lockouts/backoff.)
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: body("Too many attempts, try again later."),
  skip,
});

// Account creation has no "failed attempt" to count, so every request counts, with a low ceiling.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: body("Too many accounts created from this address, try again later."),
  skip,
});
