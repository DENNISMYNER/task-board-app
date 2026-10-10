import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../../components/ui/Button";
import { Dialog } from "../../../components/ui/Dialog";
import { SelectField, TextField } from "../../../components/ui/Field";
import { categoryLabel } from "../../../components/ui/StatusRing";
import { useToast } from "../../../components/ui/Toast";
import type { ColumnWithTasks, StatusCategory } from "../../../lib/api";
import { ApiError } from "../../../lib/api";
import { errorMessage } from "../../../lib/errors";
import { useDeleteColumn, useUpdateColumn } from "../hooks/useBoardMutations";

const CATEGORIES: StatusCategory[] = ["BACKLOG", "UNSTARTED", "STARTED", "COMPLETED", "CANCELED"];

interface Props {
  boardId: string;
  column: ColumnWithTasks | null;
  canDelete: boolean;
  onClose: () => void;
}

export function ColumnSettingsDialog({ boardId, column, canDelete, onClose }: Props) {
  return (
    <Dialog open={column !== null} onClose={onClose} title="Column settings">
      {/* keyed so the form state resets when a different column is opened */}
      {column && <SettingsForm key={column.id} boardId={boardId} column={column} canDelete={canDelete} onClose={onClose} />}
    </Dialog>
  );
}

function SettingsForm({ boardId, column, canDelete, onClose }: Required<Props> & { column: ColumnWithTasks }) {
  const [name, setName] = useState(column.name);
  const [category, setCategory] = useState<StatusCategory>(column.category);
  const [wip, setWip] = useState(column.wipLimit?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateColumn(boardId);
  const remove = useDeleteColumn(boardId);
  const toast = useToast();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const limit = wip.trim() === "" ? null : Number(wip);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return setError("The work-in-progress limit must be a whole number, 1 or more.");
    update.mutate(
      { columnId: column.id, name: name.trim(), category, wipLimit: limit },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof ApiError && err.code === "COLUMN_NAME_TAKEN" ? "Another column already has this name." : errorMessage(err)),
      },
    );
  }

  function onDelete() {
    remove.mutate(column.id, {
      onSuccess: () => {
        toast({ title: `Deleted “${column.name}”`, tone: "success" });
        onClose();
      },
      onError: (err) => setError(err instanceof ApiError && err.code === "COLUMN_NOT_EMPTY" ? "Move or delete this column's tasks first." : errorMessage(err)),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
      <TextField label="Name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <SelectField
        label="Status type"
        hint="Decides the icon, and whether tasks dropped here count as done."
        value={category}
        onChange={(e) => setCategory(e.target.value as StatusCategory)}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{categoryLabel(c)}</option>
        ))}
      </SelectField>
      <TextField label="Work-in-progress limit" inputMode="numeric" placeholder="No limit" value={wip} onChange={(e) => setWip(e.target.value)} hint="Optional. The count turns red when the column goes over." />
      {error && <p role="alert" className="text-sm text-signal">{error}</p>}
      <div className="flex items-center justify-between gap-3 pt-1">
        {canDelete ? (
          confirmDelete ? (
            <Button variant="danger" loading={remove.isPending} onClick={onDelete}>Delete column</Button>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete…</Button>
          )
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={update.isPending} disabled={!name.trim()}>Save changes</Button>
        </div>
      </div>
    </form>
  );
}
