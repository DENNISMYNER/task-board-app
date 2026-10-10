import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspacesApi } from "../../lib/api";
import { qk } from "../../lib/queryKeys";

export function useWorkspaces() {
  return useQuery({ queryKey: qk.workspaces, queryFn: workspacesApi.list });
}

export function useWorkspaceBoards(workspaceId: string | undefined) {
  return useQuery({
    queryKey: qk.boards(workspaceId ?? ""),
    queryFn: () => workspacesApi.boards(workspaceId as string),
    enabled: Boolean(workspaceId),
  });
}

export function useMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: qk.members(workspaceId ?? ""),
    queryFn: () => workspacesApi.members(workspaceId as string),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000, // membership rarely changes
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => workspacesApi.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.workspaces }),
  });
}

export function useCreateBoard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; key: string; description?: string }) => workspacesApi.createBoard(workspaceId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.boards(workspaceId) }),
  });
}
