// Shapes of the JSON the Express API returns. Dates arrive as ISO-8601 strings.
// Keep this file in sync with the backend (later you can generate it from an OpenAPI/zod schema).

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
export type StatusCategory = "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELED";
export type TaskPriority = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ActivityAction =
  | "WORKSPACE_CREATED" | "WORKSPACE_UPDATED" | "MEMBER_ADDED" | "MEMBER_REMOVED" | "MEMBER_ROLE_CHANGED"
  | "BOARD_CREATED" | "BOARD_UPDATED" | "BOARD_ARCHIVED"
  | "COLUMN_CREATED" | "COLUMN_UPDATED" | "COLUMN_REORDERED" | "COLUMN_DELETED"
  | "TASK_CREATED" | "TASK_UPDATED" | "TASK_MOVED" | "TASK_ASSIGNED" | "TASK_UNASSIGNED"
  | "TASK_PRIORITY_CHANGED" | "TASK_DUE_DATE_CHANGED" | "TASK_ARCHIVED" | "TASK_DELETED"
  | "COMMENT_CREATED" | "COMMENT_UPDATED" | "COMMENT_DELETED";

export const PRIORITIES: readonly TaskPriority[] = ["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"];

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  timezone: string;
  createdAt: string;
}

/** The slim user shape embedded in tasks, comments and activity. */
export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  role: WorkspaceRole;
}

export interface Member {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null; jobTitle: string | null };
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  key: string;
  taskCounter: number;
  archivedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardListItem extends Board {
  _count: { tasks: number };
}

export interface Task {
  id: string;
  boardId: string;
  columnId: string;
  number: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  assigneeId: string | null;
  creatorId: string | null;
  version: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: Person | null;
  _count: { comments: number };
}

export interface TaskDetail extends Task {
  creator: Person | null;
  column: { id: string; name: string; category: StatusCategory };
  board: { id: string; key: string; name: string };
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  category: StatusCategory;
  position: number;
  wipLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnWithTasks extends Column {
  tasks: Task[];
}

/** Response of GET /boards/:id: everything the board screen needs in one round trip. */
export interface BoardData {
  board: Board;
  columns: ColumnWithTasks[];
  role: WorkspaceRole;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  parentId: string | null;
  /** null once deleted (the comment stays as a tombstone while it still has replies) */
  body: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: Person | null;
  deleted: boolean;
}

export interface CommentThread extends Comment {
  replies: Comment[];
}

export interface ActivityItem {
  id: string; // BigInt serialised as a string by the API
  workspaceId: string;
  boardId: string | null;
  taskId: string | null;
  actorId: string | null;
  action: ActivityAction;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: Person | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

/** A position change the server applied. Moves usually carry one; a rebalance carries many. */
export interface PositionChange {
  id: string;
  position: number;
}

export interface MoveTaskResult {
  task: Task;
  fromColumnId: string;
  changes: PositionChange[];
}

export interface MoveColumnResult {
  columnId: string;
  changes: PositionChange[];
}

// ── Request bodies ────────────────────────────────────────────

export interface CreateTaskInput {
  columnId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
}

/** `version` is the optimistic-concurrency token: the version of the task you edited. */
export interface UpdateTaskInput {
  version: number;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
}
