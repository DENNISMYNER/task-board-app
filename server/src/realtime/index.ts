import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { logger } from "../lib/logger";
import { MIN_ROLE, requireBoardAccess } from "../modules/access/access.service";

// ─────────────────────────────────────────────────────────────
// Events the server pushes to clients
// ─────────────────────────────────────────────────────────────

export type RealtimeEvent =
  | "board:updated"
  | "column:created"
  | "column:updated"
  | "column:moved"
  | "column:deleted"
  | "task:created"
  | "task:updated"
  | "task:moved"
  | "task:deleted"
  | "comment:created"
  | "comment:updated"
  | "comment:deleted";

/** Every event uses the same envelope so the client can handle them uniformly. */
export interface RealtimeEnvelope<T = unknown> {
  boardId: string;
  /** Who caused the change. A client can ignore events where actorId is itself (it already applied them). */
  actorId: string;
  data: T;
  at: string;
}

type Ack = { ok: true } | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// Server lifecycle
// ─────────────────────────────────────────────────────────────

let io: Server | null = null;

const boardRoom = (boardId: string) => `board:${boardId}`;
const userRoom = (userId: string) => `user:${userId}`;

const boardIdPayload = z.object({ boardId: z.uuid() });

function userIdOf(socket: Socket): string {
  return z.string().parse(socket.data.userId);
}

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    maxHttpBufferSize: 100_000, // clients only send tiny join/leave messages
  });

  // Authenticate during the handshake: browsers send { auth: { token } } when connecting.
  // NOTE: the token is verified once, at connect time. A connection can outlive the 15 min token;
  // that is normal for sockets, and access is still re-checked on every `board:join`.
  io.use((socket, next) => {
    try {
      const token = z.string().min(1).parse(socket.handshake.auth?.token);
      socket.data.userId = verifyAccessToken(token);
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const userId = userIdOf(socket);
    void socket.join(userRoom(userId)); // lets us target all of a user's tabs (e.g. to revoke access)
    logger.debug({ userId, socketId: socket.id }, "socket connected");

    // A client must ask to join a board room, and we check workspace membership every time.
    socket.on("board:join", async (payload: unknown, ack?: (res: Ack) => void) => {
      try {
        const { boardId } = boardIdPayload.parse(payload);
        await requireBoardAccess(userId, boardId, MIN_ROLE.read);
        await socket.join(boardRoom(boardId));
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof AppError ? err.message : "Unable to join board" });
      }
    });

    socket.on("board:leave", async (payload: unknown, ack?: (res: Ack) => void) => {
      const parsed = boardIdPayload.safeParse(payload);
      if (parsed.success) await socket.leave(boardRoom(parsed.data.boardId));
      ack?.({ ok: true });
    });
  });

  return io;
}

/**
 * Broadcast to everyone currently viewing a board.
 * Call this AFTER the database transaction has committed, never inside it: otherwise clients
 * could be told about a change that then rolls back. If realtime isn't initialised (tests), it's a no-op.
 */
export function emitToBoard<T>(boardId: string, event: RealtimeEvent, actorId: string, data: T): void {
  if (!io) return;
  const envelope: RealtimeEnvelope<T> = { boardId, actorId, data, at: new Date().toISOString() };
  io.to(boardRoom(boardId)).emit(event, envelope);
}

/** Remove a user's live sockets from board rooms (e.g. after they are removed from a workspace). */
export function removeUserFromBoards(userId: string, boardIds: string[]): void {
  if (!io || boardIds.length === 0) return;
  io.in(userRoom(userId)).socketsLeave(boardIds.map(boardRoom));
}

/** Closes all sockets AND the underlying HTTP server. */
export function closeRealtime(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) return resolve();
    io.close(() => resolve());
  });
}
