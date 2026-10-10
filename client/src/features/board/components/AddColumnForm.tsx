import { Plus } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { ApiError } from "../../../lib/api";
import { errorMessage } from "../../../lib/errors";
import { useCreateColumn } from "../hooks/useBoardMutations";

export function AddColumnForm({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useCreateColumn(boardId);
  const toast = useToast();

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setName("");
          setOpen(false);
        },
        onError: (err) =>
          toast({
            title: "Couldn't add the column",
            description: err instanceof ApiError && err.code === "COLUMN_NAME_TAKEN" ? "Another column already has this name." : errorMessage(err),
            tone: "error",
          }),
      },
    );
  }

  if (!open) {
    return (
      <Button className="w-[19rem] shrink-0 justify-start border-dashed" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add column
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-[19rem] shrink-0 flex-col gap-2 rounded-col border border-line bg-surface p-3">
      <input
        autoFocus
        value={name}
        maxLength={80}
        aria-label="Column name"
        placeholder="Column name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="h-9 rounded-md border border-accent bg-raised px-3 text-sm outline-none"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={!name.trim()}>Add column</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
