import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, isProd } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";
import apiRoutes from "./routes";

/** Builds the Express app. Kept separate from server.ts so tests can use it without opening a port. */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Behind a reverse proxy/load balancer (Render, Fly, Nginx...) req.ip would be the proxy's IP,
  // which breaks rate limiting. In production we trust one proxy hop.
  if (isProd) app.set("trust proxy", 1);

  // Structured request logs with a request id; the id is also returned in the `x-request-id` header
  // and in error bodies, so a user's bug report can be matched to server logs.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && /^[\w-]{1,64}$/.test(incoming) ? incoming : crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );

  app.use(helmet()); // sensible security headers
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true })); // credentials: true => refresh cookie works
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());

  // Liveness: is the process up? Readiness: can it reach the database? (used by deploy platforms)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/api/v1", apiLimiter, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler); // must be registered last

  return app;
}
