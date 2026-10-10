import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { TextArea, TextField } from "../../components/ui/Field";
import { ApiError } from "../../lib/api";
import type { Board } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useCreateBoard } from "./hooks";

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/** "Engineering Platform" -> "EP", "Website" -> "WEB": a short prefix for task ids like WEB-12. */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  return raw.replace(/^[0-9]+/, "").slice(0, 10);
}

interface Props {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (board: Board) => void;
}

export function CreateBoardDialog({ workspaceId, open, onClose, onCreated }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title="New board">
      <BoardForm workspaceId={workspaceId} onClose={onClose} onCreated={onCreated} />
    </Dialog>
  );
}

function BoardForm({ workspaceId, onClose, onCreated }: Omit<Props, "open">) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateBoard(workspaceId);

  // Until you type your own key, it follows the name.
  const shownKey = keyEdited ? key : suggestKey(name);
  const keyValid = KEY_PATTERN.test(shownKey);

  function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    create.mutate(
      { name: name.trim(), key: shownKey, description: description.trim() || undefined },
      {
        onSuccess: onCreated,
        onError: (err) => {
          if (err instanceof ApiError && err.code === "BOARD_KEY_TAKEN") setErrors({ key: "Another board already uses this key." });
          else if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setErrors(err.fieldErrors);
          else setErrors({ form: errorMessage(err) });
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-5">
      <TextField label="Board name" autoFocus required maxLength={120} placeholder="Website redesign" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <TextField
        label="Key"
        required
        maxLength={10}
        value={shownKey}
        onChange={(e) => {
          setKeyEdited(true);
          setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
        }}
        error={errors.key ?? (shownKey && !keyValid ? "Use 2–10 letters or digits, starting with a letter." : undefined)}
        hint={`Task ids start with this, like ${keyValid ? shownKey : "WEB"}-12.`}
        className="font-medium tracking-wide uppercase"
      />
      <TextArea label="Description" maxLength={5000} rows={3} placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
      {errors.form && <p role="alert" className="text-sm text-signal">{errors.form}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim() || !keyValid}>Create board</Button>
      </div>
    </form>
  );
}
