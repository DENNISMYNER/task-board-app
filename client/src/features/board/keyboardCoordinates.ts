import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Keyboard movement while dragging.
 *
 * dnd-kit's default getter (`sortableKeyboardCoordinates`) picks "the nearest droppable in that
 * direction". On a board that is ambiguous: from a card, ArrowRight can land on the card's own old slot
 * or skip a column entirely. Boards need a simpler rule that people can predict:
 *
 *   ArrowLeft / ArrowRight   a card moves to the neighbouring column, keeping its height in the column
 *   ArrowUp / ArrowDown      the default behaviour, i.e. step over the neighbouring card
 *
 * Dragging a *column* keeps the default getter: its siblings are in a single row, so it already works.
 */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { active, droppableRects, droppableContainers, collisionRect } = args.context;

  const isSideways = event.code === "ArrowLeft" || event.code === "ArrowRight";
  if (!isSideways || !active || !collisionRect || active.data.current?.type === "column") {
    return sortableKeyboardCoordinates(event, args);
  }
  event.preventDefault();

  const columns = droppableContainers
    .getEnabled()
    .filter((container) => container.data.current?.type === "column")
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [rect] : [];
    })
    .sort((a, b) => a.left - b.left);

  // The column the dragged card is currently in: the one that contains its horizontal centre.
  const centre = collisionRect.left + collisionRect.width / 2;
  const current = columns.findIndex((rect) => centre >= rect.left && centre <= rect.left + rect.width);
  const target = columns[current + (event.code === "ArrowRight" ? 1 : -1)];
  if (current < 0 || !target) return undefined; // already at the first/last column

  // Centre the card horizontally in the target column. Keep roughly the same height, but stay below the
  // column header and inside the column so the drop target is the column (or one of its cards).
  const header = 56;
  const minTop = target.top + header;
  const maxTop = Math.max(minTop, target.top + target.height - collisionRect.height);
  return {
    x: target.left + (target.width - collisionRect.width) / 2,
    y: Math.min(Math.max(collisionRect.top, minTop), maxTop),
  };
};
