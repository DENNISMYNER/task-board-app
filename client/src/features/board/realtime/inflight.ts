// Remembers which tasks THIS tab is currently moving.
//
// When you drop a card, the server broadcasts "task:moved" to everyone in the room, including you.
// Applying that echo while your own request is still in flight could briefly snap the card back
// (think: you drag twice quickly and the first echo arrives after your second drop).
// So realtime handlers skip events about tasks with an in-flight move, and we refetch afterwards
// if anything was skipped.

const moving = new Map<string, { count: number; skipped: boolean }>();

export function beginMove(taskId: string): void {
  const entry = moving.get(taskId);
  if (entry) entry.count++;
  else moving.set(taskId, { count: 1, skipped: false });
}

/** @returns true if a realtime event was ignored meanwhile, so the caller should refetch. */
export function endMove(taskId: string): boolean {
  const entry = moving.get(taskId);
  if (!entry) return false;
  if (--entry.count > 0) return false;
  moving.delete(taskId);
  return entry.skipped;
}

/** Returns true (and remembers the skip) if realtime should ignore events about this task right now. */
export function shouldSkipRealtime(taskId: string): boolean {
  const entry = moving.get(taskId);
  if (!entry) return false;
  entry.skipped = true;
  return true;
}
