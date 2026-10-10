import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/Field";
import type { Workspace } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useCreateWorkspace } from "./hooks";

/** Used both in the "New workspace" dialog and on the first-run screen. */
export function CreateWorkspaceForm({ onCreated, onCancel, autoFocus }: { onCreated: (workspace: Workspace) => void; onCancel?: () => void; autoFocus?: boolean }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateWorkspace();

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(name.trim(), { onSuccess: onCreated, onError: (err) => setError(errorMessage(err)) });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 text-left">
      <TextField
        label="Workspace name"
        autoFocus={autoFocus}
        required
        maxLength={120}
        placeholder="Acme Engineering"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error ?? undefined}
        hint="Usually your team or company."
      />
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>Create workspace</Button>
      </div>
    </form>
  );
}
