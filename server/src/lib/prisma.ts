import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";

// Prisma 7 talks to Postgres through a driver adapter (node-postgres under the hood).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

/**
 * Either the root client or the client handed to you inside `prisma.$transaction(async (tx) => ...)`.
 * Service helpers accept this so the same function works inside or outside a transaction.
 */
export type Db = Prisma.TransactionClient;

/** True for Prisma's "unique constraint failed" error (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Take a row-level lock so concurrent drag-and-drops into the same column (or reorders on the
 * same board) run one after another instead of computing the same position twice.
 * Must be called inside a transaction; the lock is released at commit/rollback.
 */
export async function lockColumn(tx: Db, columnId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM columns WHERE id = ${columnId}::uuid FOR UPDATE`;
}

export async function lockBoard(tx: Db, boardId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM boards WHERE id = ${boardId}::uuid FOR UPDATE`;
}
