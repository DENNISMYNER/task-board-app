import pino from "pino";
import { env, isProd } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : isProd ? "info" : "debug",
  // Never write credentials to logs.
  redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
  transport: isProd ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
