import { useQuery } from "@tanstack/react-query";
import { boardsApi } from "../../../lib/api";
import { qk } from "../../../lib/queryKeys";

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: qk.board(boardId),
    queryFn: () => boardsApi.get(boardId),
  });
}
