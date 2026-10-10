import http from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { closeRealtime, initRealtime } from "./realtime";

const app = createApp();
const server = http.createServer(app);
initRealtime(server); // Socket.io shares the same HTTP server and port

server.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown: stop accepting connections, let in-flight requests finish, then close the DB pool.
// Platforms send SIGTERM on every deploy, so this runs often in production.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const force = setTimeout(() => process.exit(1), 10_000); // don't hang forever on stuck connections
  force.unref();

  await closeRealtime(); // closes sockets and the HTTP server
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
// A rejected promise nobody awaited is logged and the process keeps serving; an uncaught exception
// leaves the process in an unknown state, so log it, then exit and let the supervisor restart us.
process.on("unhandledRejection", (reason) => logger.error({ reason }, "Unhandled promise rejection"));
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  void shutdown("uncaughtException").finally(() => process.exit(1));
});
