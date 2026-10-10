import { http } from "./http";
import type { Board, BoardListItem, Member, Workspace, WorkspaceRole } from "./types";

export const workspacesApi = {
  list: () => http.get<{ workspaces: Workspace[] }>("/workspaces").then((r) => r.workspaces),
  create: (name: string) => http.post<{ workspace: Workspace }>("/workspaces", { name }).then((r) => r.workspace),

  members: (workspaceId: string) =>
    http.get<{ members: Member[] }>(`/workspaces/${workspaceId}/members`).then((r) => r.members),
  addMember: (workspaceId: string, input: { email: string; role?: WorkspaceRole }) =>
    http.post<{ member: Member }>(`/workspaces/${workspaceId}/members`, input).then((r) => r.member),

  boards: (workspaceId: string) =>
    http.get<{ boards: BoardListItem[] }>(`/workspaces/${workspaceId}/boards`).then((r) => r.boards),
  createBoard: (workspaceId: string, input: { name: string; key: string; description?: string }) =>
    http.post<{ board: Board }>(`/workspaces/${workspaceId}/boards`, input).then((r) => r.board),
};
