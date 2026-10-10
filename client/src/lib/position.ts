// Client-side mirror of the server's fractional ordering (backend: src/lib/position.ts).
//
// Every task/column has a numeric `position`; a list is displayed sorted by it. To drop an item
// between two neighbours we take the midpoint, so ONE row changes instead of renumbering the list.
//
// The client only uses this to render an optimistic result instantly. The server recomputes the
// real position (and renumbers the list if neighbours got too close), and its answer always wins.

export const POSITION_GAP = 65_536;

export interface Positioned {
  id: string;
  position: number;
}

/**
 * @param siblings the other items of the target list, sorted ascending, WITHOUT the item being moved
 * @param afterId  the item it is dropped directly after; null = first in the list
 */
export function positionAfter(siblings: Positioned[], afterId: string | null): number {
  let index = 0;
  if (afterId !== null) {
    const found = siblings.findIndex((s) => s.id === afterId);
    index = found === -1 ? siblings.length : found + 1;
  }
  const prev = siblings[index - 1]?.position;
  const next = siblings[index]?.position;

  if (prev === undefined && next === undefined) return POSITION_GAP; // empty list
  if (prev === undefined) return (next as number) / 2; // new first item
  if (next === undefined) return prev + POSITION_GAP; // new last item
  return (prev + next) / 2; // between two neighbours
}

/** Stable ascending sort; `id` breaks ties exactly like the server's ORDER BY position, id. */
export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
