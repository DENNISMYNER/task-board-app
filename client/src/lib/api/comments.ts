import { http } from "./http";
import type { Comment, CommentThread } from "./types";

export const commentsApi = {
  list: (taskId: string) => http.get<{ comments: CommentThread[] }>(`/tasks/${taskId}/comments`).then((r) => r.comments),
  create: (taskId: string, input: { body: string; parentId?: string }) =>
    http.post<{ comment: Comment }>(`/tasks/${taskId}/comments`, input).then((r) => r.comment),
  update: (commentId: string, body: string) =>
    http.patch<{ comment: Comment }>(`/comments/${commentId}`, { body }).then((r) => r.comment),
  remove: (commentId: string) => http.delete(`/comments/${commentId}`),
};
