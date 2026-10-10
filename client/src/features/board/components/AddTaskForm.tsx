import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/Toast";
import { errorMessage } from "../../../lib/errors";
import { useCreateTask } from "../hooks/useBoardMutations";

export function AddTaskForm({ boardId, columnId }: { boardId: string; columnId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const create = useCreateTask(boardId);
  const toast = useToast();

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    // Clear the field right away and stay open: adding several tasks in a row is the common case, and
    // waiting for the server would swallow whatever the person types for the next task in the meantime.
    // (`mutateAsync`, not `mutate`: per-call callbacks of `mutate` only fire for the most recent call.)
    setTitle("");
    inputRef.current?.focus();
    create.mutateAsync({ columnId, title: trimmed }).catch((err: unknown) => {
      setTitle((current) => current || trimmed); // give the text back, unless they've started a new one
      toast({ title: "Couldn't add the task", description: errorMessage(err), tone: "error" });
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) submit();
    if (e.key === "Escape") {
      setOpen(false);
      setTitle("");
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add task
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        ref={inputRef}
        autoFocus
        rows={2}
        value={title}
        maxLength={500}
        aria-label="Task title"
        placeholder="What needs to be done?"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none rounded-card border border-accent bg-raised p-2.5 text-sm outline-none placeholder:text-muted/70"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={!title.trim()}>
          Add task
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setTitle(""); }}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
