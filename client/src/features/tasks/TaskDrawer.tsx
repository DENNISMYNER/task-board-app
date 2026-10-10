import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { AutoTextarea } from "../../components/ui/AutoTextarea";
import { Button } from "../../components/ui/Button";
import { cn } from "../../components/ui/cn";
import { Dialog } from "../../components/ui/Dialog";
import { StatusRing } from "../../components/ui/StatusRing";
import { useToast } from "../../components/ui/Toast";
import { PRIORITIES } from "../../lib/api";
import type { ColumnWithTasks, Member, Task, TaskPriority } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { dateInputToIso, describeDue, isoToDateInput, priorityLabel, relativeTime } from "../../lib/format";
import { useDeleteTask } from "../board/hooks/useBoardMutations";
import { ActivitySection } from "./ActivitySection";
import { CommentsSection } from "./CommentsSection";
import { conflictingTask, useUpdateTask } from "./hooks";

interface Props {
  boardId: string;
  boardKey: string;
  /** undefined = drawer closed (or the task no longer exists) */
  task: Task | undefined;
  columns: ColumnWithTasks[];
  members: Member[];
  currentUserId: string;
  canWrite: boolean;
  canManage: boolean;
  onClose: () => void;
  onMove: (move: { taskId: string; columnId: string; afterTaskId: string | null }) => void;
}

export function TaskDrawer({ boardKey, task, onClose, ...rest }: Props) {
  return (
    <Dialog open={task !== undefined} onClose={onClose} title={task ? `${boardKey}-${task.number}` : "Task"} variant="drawer">
      {/* keyed by task id so drafts never leak from one task into the next */}
      {task && <DrawerBody key={task.id} task={task} onClose={onClose} {...rest} />}
    </Dialog>
  );
}

/**
 * Text fields (title, description) are edited as a local DRAFT remembered together with the task
 * version it was based on. That lets us notice when a teammate saved in the meantime, and ask what to
 * do, instead of silently overwriting their words. The server enforces it too (409 on a stale version).
 */
interface Edit {
  baseVersion: number;
  title?: string;
  description?: string;
}

const field =
  "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-ink hover:border-line " +
  "focus-visible:border-accent focus-visible:outline-accent disabled:cursor-default disabled:opacity-100";

function Property({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 py-0.5">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <div className="min-w-0">{children(id)}</div>
    </div>
  );
}

type BodyProps = Omit<Props, "task" | "boardKey"> & { task: Task };

function DrawerBody({ boardId, task, columns, members, currentUserId, canWrite, canManage, onClose, onMove }: BodyProps) {
  const update = useUpdateTask(boardId, task.id);
  const remove = useDeleteTask(boardId);
  const toast = useToast();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const column = columns.find((c) => c.id === task.columnId);
  const title = edit?.title ?? task.title;
  const description = edit?.description ?? task.description ?? "";
  const titleDirty = edit?.title !== undefined && edit.title.trim() !== task.title;
  const descriptionDirty = edit?.description !== undefined && edit.description !== (task.description ?? "");
  const dirty = titleDirty || descriptionDirty;
  // Someone saved this task since the draft was started.
  const stale = edit !== null && dirty && task.version !== edit.baseVersion;
  const due = task.dueDate ? describeDue(task.dueDate, task.completedAt !== null) : null;

  /**
   * After one of OUR saves, move the draft's base to the new version, but only if nothing else was
   * saved in between (version went up by exactly one). Otherwise the conflict warning must stay.
   */
  function rebase(savedVersion: number) {
    setEdit((prev) => (prev && savedVersion === prev.baseVersion + 1 ? { ...prev, baseVersion: savedVersion } : prev));
  }

  function setDraft(name: "title" | "description", value: string) {
    setEdit((prev) => {
      const base = prev?.baseVersion ?? task.version;
      return name === "title" ? { ...prev, baseVersion: base, title: value } : { ...prev, baseVersion: base, description: value };
    });
  }

  function discard(...names: Array<"title" | "description">) {
    setEdit((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      for (const name of names) delete next[name];
      return next.title === undefined && next.description === undefined ? null : next;
    });
  }

  function saveText(fields: { title?: string; description?: string }, overwrite = false) {
    const version = overwrite ? task.version : (edit?.baseVersion ?? task.version);
    update.mutate(
      {
        input: {
          version,
          ...(fields.title !== undefined && { title: fields.title }),
          ...(fields.description !== undefined && { description: fields.description.trim() ? fields.description : null }),
        },
      },
      {
        onSuccess: (saved) => {
          discard(...(Object.keys(fields) as Array<"title" | "description">));
          rebase(saved.version);
        },
        onError: (err) =>
          toast(
            conflictingTask(err)
              ? { title: "Someone else changed this task", description: "Choose whether to keep your edit or use their version.", tone: "error" }
              : { title: "Couldn't save your changes", description: errorMessage(err), tone: "error" },
          ),
      },
    );
  }

  /** Priority, assignee, due date: independent fields that save the moment you change them. */
  function saveProperty(input: { priority?: TaskPriority; assigneeId?: string | null; dueDate?: string | null }, optimistic: Partial<Task>) {
    update.mutate(
      { input: { version: task.version, ...input }, optimistic, retryOnConflict: true },
      {
        onSuccess: (saved) => rebase(saved.version),
        onError: (err) => toast({ title: "Couldn't save the change", description: errorMessage(err), tone: "error" }),
      },
    );
  }

  function changeStatus(columnId: string) {
    if (columnId === task.columnId) return;
    const target = columns.find((c) => c.id === columnId);
    // Dropping it at the bottom of the chosen column, as a status dropdown would imply.
    onMove({ taskId: task.id, columnId, afterTaskId: target?.tasks.at(-1)?.id ?? null });
  }

  function onTitleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape" && edit?.title !== undefined) {
      e.stopPropagation(); // don't close the drawer; just undo the rename
      discard("title");
    }
  }

  function onTitleBlur() {
    if (!titleDirty) return discard("title");
    const next = (edit?.title ?? "").trim();
    if (next) saveText({ title: next });
    else discard("title"); // a task can't have an empty title: go back to the saved one
  }

  function onDelete() {
    remove.mutate(task.id, {
      // The board page announces "This task was deleted" when the card disappears, so no toast here.
      onSuccess: onClose,
      onError: (err) => toast({ title: "Couldn't delete the task", description: errorMessage(err), tone: "error" }),
    });
  }

  const assigneeIsMember = task.assigneeId === null || members.some((m) => m.user.id === task.assigneeId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <AutoTextarea
          aria-label="Title"
          value={title}
          maxLength={500}
          disabled={!canWrite}
          onChange={(e) => setDraft("title", e.target.value)}
          onBlur={onTitleBlur}
          onKeyDown={onTitleKeyDown}
          className="-mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-2xl leading-tight font-semibold hover:border-line focus-visible:border-accent focus-visible:outline-accent disabled:opacity-100"
        />
        <p className="mt-1 text-[13px] text-muted">
          Created <time dateTime={task.createdAt}>{relativeTime(task.createdAt)}</time>
          {task.completedAt && (
            <>
              {" "}
              and completed <time dateTime={task.completedAt}>{relativeTime(task.completedAt)}</time>
            </>
          )}
          .
        </p>

        <div className="mt-5 flex flex-col">
          <Property label="Status">
            {(id) => (
              <div className="flex items-center gap-1.5">
                {column && <StatusRing category={column.category} className="ml-2" />}
                <select id={id} value={task.columnId} disabled={!canWrite} onChange={(e) => changeStatus(e.target.value)} className={field}>
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Property>

          <Property label="Assignee">
            {(id) => (
              <select
                id={id}
                value={task.assigneeId ?? ""}
                disabled={!canWrite}
                onChange={(e) => {
                  const member = members.find((m) => m.user.id === e.target.value);
                  saveProperty(
                    { assigneeId: member?.user.id ?? null },
                    { assigneeId: member?.user.id ?? null, assignee: member ? { id: member.user.id, name: member.user.name, avatarUrl: member.user.avatarUrl } : null },
                  );
                }}
                className={field}
              >
                <option value="">Unassigned</option>
                {!assigneeIsMember && task.assignee && <option value={task.assignee.id}>{task.assignee.name}</option>}
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            )}
          </Property>

          <Property label="Priority">
            {(id) => (
              <select id={id} value={task.priority} disabled={!canWrite} onChange={(e) => saveProperty({ priority: e.target.value as TaskPriority }, { priority: e.target.value as TaskPriority })} className={field}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            )}
          </Property>

          <Property label="Due date">
            {(id) => (
              <div className="flex items-center gap-2">
                <input
                  id={id}
                  type="date"
                  value={isoToDateInput(task.dueDate)}
                  disabled={!canWrite}
                  onChange={(e) => {
                    const iso = dateInputToIso(e.target.value);
                    saveProperty({ dueDate: iso }, { dueDate: iso });
                  }}
                  className={cn(field, "w-auto min-w-40")}
                />
                {due?.tone === "overdue" && <span className="text-[13px] font-medium text-signal">Overdue</span>}
              </div>
            )}
          </Property>
        </div>

        <section aria-label="Description" className="mt-6">
          <h3 className="text-sm font-semibold">Description</h3>
          <textarea
            aria-label="Description"
            value={description}
            disabled={!canWrite}
            rows={5}
            maxLength={50_000}
            placeholder={canWrite ? "Add more detail, links, or acceptance criteria…" : "No description."}
            onChange={(e) => setDraft("description", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && descriptionDirty) saveText({ description });
              if (e.key === "Escape" && descriptionDirty) {
                e.stopPropagation();
                discard("description");
              }
            }}
            className="mt-1.5 w-full resize-y rounded-card border border-line bg-raised p-3 text-sm leading-relaxed placeholder:text-muted/70 hover:border-line-strong focus-visible:border-accent focus-visible:outline-accent disabled:opacity-100"
          />
          {descriptionDirty && !stale && (
            <div className="mt-2 flex items-center gap-2">
              <Button variant="primary" size="sm" loading={update.isPending} onClick={() => saveText({ description })}>
                Save description
              </Button>
              <Button variant="ghost" size="sm" onClick={() => discard("description")}>
                Discard
              </Button>
              <span className="ml-auto hidden text-xs text-muted sm:inline">Ctrl+Enter to save</span>
            </div>
          )}
        </section>

        {stale && edit && (
          <div role="status" className="mt-4 rounded-card border border-warn/40 bg-warn-soft p-3 text-sm text-ink">
            <p className="font-medium">Someone else changed this task while you were editing.</p>
            <p className="mt-0.5 text-muted">Keeping your edit replaces what they saved for the same field.</p>
            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                variant="primary"
                loading={update.isPending}
                onClick={() => saveText({ ...(titleDirty && { title: edit.title?.trim() }), ...(descriptionDirty && { description }) }, true)}
              >
                Keep my edits
              </Button>
              <Button size="sm" onClick={() => setEdit(null)}>
                Use their version
              </Button>
            </div>
          </div>
        )}

        <section className="mt-8">
          <Tabs
            tab={tab}
            onChange={setTab}
            commentCount={task._count.comments}
            comments={<CommentsSection boardId={boardId} taskId={task.id} currentUserId={currentUserId} canManage={canManage} />}
            activity={<ActivitySection taskId={task.id} members={members} />}
          />
        </section>
      </div>

      {canWrite && (
        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[13px] text-muted">{confirmDelete ? "This also deletes its comments. It can't be undone." : ""}</p>
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep task
              </Button>
              <Button variant="danger" size="sm" loading={remove.isPending} onClick={onDelete}>
                Delete task
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete…
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}

type TabId = "comments" | "activity";

function Tabs({ tab, onChange, commentCount, comments, activity }: { tab: TabId; onChange: (t: TabId) => void; commentCount: number; comments: ReactNode; activity: ReactNode }) {
  const base = useId();
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "comments", label: commentCount > 0 ? `Comments (${commentCount})` : "Comments" },
    { id: "activity", label: "Activity" },
  ];

  // Arrow keys move between tabs, as in the WAI-ARIA tabs pattern.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tab === "comments" ? "activity" : "comments";
    onChange(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Task discussion" onKeyDown={onKeyDown} className="flex gap-5 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px border-b-2 pb-2 text-sm font-medium",
              tab === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel-${tab}`} aria-labelledby={`${base}-tab-${tab}`} className="pt-4">
        {tab === "comments" ? comments : activity}
      </div>
    </>
  );
}
