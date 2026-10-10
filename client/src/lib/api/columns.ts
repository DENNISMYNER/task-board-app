import { http } from "./http";
import type { Column, MoveColumnResult, StatusCategory } from "./types";

export const columnsApi = {
  create: (boardId: string, input: { name: string; category?: StatusCategory; wipLimit?: number | null }) =>
    http.post<{ column: Column }>(`/boards/${boardId}/columns`, input).then((r) => r.column),
  update: (columnId: string, input: { name?: string; category?: StatusCategory; wipLimit?: number | null }) =>
    http.patch<{ column: Column }>(`/columns/${columnId}`, input).then((r) => r.column),
  /** "Put this column directly after `afterColumnId`" (null = first). The server owns the ordering math. */
  move: (columnId: string, afterColumnId: string | null) =>
    http.post<MoveColumnResult>(`/columns/${columnId}/move`, { afterColumnId }),
  remove: (columnId: string) => http.delete(`/columns/${columnId}`),
};
