import { http } from "./http";
import type { ActivityPage, Board, BoardData } from "./types";

export const boardsApi = {
  get: (boardId: string) => http.get<BoardData>(`/boards/${boardId}`),
  update: (boardId: string, input: { name?: string; description?: string | null; archived?: boolean }) =>
    http.patch<{ board: Board }>(`/boards/${boardId}`, input).then((r) => r.board),
  archive: (boardId: string) => http.delete(`/boards/${boardId}`),
  activity: (boardId: string, cursor?: string) =>
    http.get<ActivityPage>(`/boards/${boardId}/activity`, { query: { cursor, limit: 30 } }),
};
