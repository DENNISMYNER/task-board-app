// Fractional ordering helpers, used for columns (within a board) and tasks (within a column).
//
// Every item has a Float `position`. To insert between two neighbours we take the midpoint,
// so a drag-and-drop updates ONE row instead of renumbering the whole list.
// If neighbours get too close (many inserts in the same spot) the list is renumbered.

export const POSITION_GAP = 65_536;
const MIN_GAP = 0.0001;

export interface Positioned {
  id: string;
  position: number;
}

export interface MovePlan {
  /** The position the moved item should get. */
  position: number;
  /**
   * Only set when the list had to be renumbered. Contains EVERY item, including the moved one,
   * with its new position, in display order.
   */
  rebalanced: Positioned[] | null;
}

/** Position for an item appended to the end of a list. */
export function positionAfter(lastPosition: number | null | undefined): number {
  return lastPosition == null ? POSITION_GAP : lastPosition + POSITION_GAP;
}

/**
 * Work out where `movedId` should go.
 *
 * @param siblings the other items of the target list, sorted ascending, WITHOUT the moved item
 * @param afterId  the item it should sit directly after, or null to make it the first item
 * @returns the plan, or null when `afterId` is not one of `siblings`
 */
export function planMove(
  siblings: Positioned[],
  movedId: string,
  afterId: string | null,
): MovePlan | null {
  let index = 0; // index in `siblings` where the moved item will be inserted
  if (afterId !== null) {
    const afterIndex = siblings.findIndex((s) => s.id === afterId);
    if (afterIndex === -1) return null;
    index = afterIndex + 1;
  }

  const prev = siblings[index - 1]?.position;
  const next = siblings[index]?.position;

  let position: number;
  if (prev === undefined && next === undefined) position = POSITION_GAP; // empty list
  else if (prev === undefined) position = (next as number) / 2; // becomes the first item
  else if (next === undefined) position = prev + POSITION_GAP; // becomes the last item
  else position = (prev + next) / 2; // between two neighbours

  const tooClose = prev !== undefined && next !== undefined && next - prev < MIN_GAP;
  const tooSmall = prev === undefined && next !== undefined && next < MIN_GAP;
  if (!tooClose && !tooSmall) return { position, rebalanced: null };

  const ordered: Positioned[] = [
    ...siblings.slice(0, index),
    { id: movedId, position: 0 },
    ...siblings.slice(index),
  ];
  const rebalanced = ordered.map((item, i) => ({ id: item.id, position: (i + 1) * POSITION_GAP }));
  return { position: rebalanced[index]?.position ?? position, rebalanced };
}
