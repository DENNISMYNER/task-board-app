import { ActivityAction, Prisma } from "../../generated/prisma/client";
import { prisma, type Db } from "../../lib/prisma";
import { MIN_ROLE, requireBoardAccess, requireTaskAccess } from "../access/access.service";

export interface ActivityEntry {
  workspaceId: string;
  boardId?: string | null;
  taskId?: string | null;
  actorId: string;
  action: ActivityAction;
  /** Store a snapshot (titles, from/to values) so the history still reads well after deletes/renames. */
  metadata?: Prisma.InputJsonObject;
}

/**
 * Append audit entries. Pass the transaction client (`tx`) so the log row is committed
 * atomically with the change it describes: either both happen or neither does.
 */
export async function logActivity(db: Db, entries: ActivityEntry | ActivityEntry[]): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  await db.activityLog.createMany({
    data: list.map((e) => ({
      workspaceId: e.workspaceId,
      boardId: e.boardId ?? null,
      taskId: e.taskId ?? null,
      actorId: e.actorId,
      action: e.action,
      metadata: e.metadata,
    })),
  });
}

interface PageQuery {
  cursor?: string | undefined;
  limit: number;
}

async function page(where: Prisma.ActivityLogWhereInput, { cursor, limit }: PageQuery) {
  const rows = await prisma.activityLog.findMany({
    where: { ...where, ...(cursor ? { id: { lt: BigInt(cursor) } } : {}) },
    orderBy: { id: "desc" }, // newest first; the monotonic id doubles as the cursor
    take: limit + 1, // one extra row tells us whether another page exists
    include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
  });

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    ...row,
    id: row.id.toString(), // JSON can't serialize BigInt
  }));

  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export async function listBoardActivity(userId: string, boardId: string, query: PageQuery) {
  await requireBoardAccess(userId, boardId, MIN_ROLE.read);
  return page({ boardId }, query);
}

export async function listTaskActivity(userId: string, taskId: string, query: PageQuery) {
  await requireTaskAccess(userId, taskId, MIN_ROLE.read);
  return page({ taskId }, query);
}
