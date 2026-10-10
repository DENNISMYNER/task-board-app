// One place for every cache key, so invalidation can't drift out of sync with the queries.
export const qk = {
  workspaces: ["workspaces"] as const,
  members: (workspaceId: string) => ["workspaces", workspaceId, "members"] as const,
  boards: (workspaceId: string) => ["workspaces", workspaceId, "boards"] as const,
  board: (boardId: string) => ["board", boardId] as const,
  task: (taskId: string) => ["task", taskId] as const,
  comments: (taskId: string) => ["task", taskId, "comments"] as const,
  taskActivity: (taskId: string) => ["task", taskId, "activity"] as const,
};
