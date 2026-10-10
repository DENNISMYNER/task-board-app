import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { PageSpinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import type { Comment, CommentThread } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { relativeTime } from "../../lib/format";
import { useCommentMutations, useComments } from "./hooks";

interface Props {
  boardId: string;
  taskId: string;
  currentUserId: string;
  canManage: boolean;
}

export function CommentsSection({ boardId, taskId, currentUserId, canManage }: Props) {
  const { data: threads, isPending, isError, refetch } = useComments(taskId);
  const mutations = useCommentMutations(boardId, taskId);
  const toast = useToast();
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const fail = (title: string) => (err: unknown) => toast({ title, description: errorMessage(err), tone: "error" });

  if (isPending) return <PageSpinner label="Loading comments" />;
  if (isError)
    return (
      <p className="py-6 text-sm text-muted">
        Couldn't load comments. <button className="font-medium text-accent hover:underline" onClick={() => void refetch()}>Try again</button>
      </p>
    );

  return (
    <div className="flex flex-col gap-5">
      {threads.length === 0 && <p className="text-sm text-muted">No comments yet. Start the conversation below.</p>}

      <ul className="flex flex-col gap-5">
        {threads.map((thread) => (
          <li key={thread.id} className="flex flex-col gap-3">
            <CommentItem
              comment={thread}
              canEdit={thread.authorId === currentUserId}
              canDelete={thread.authorId === currentUserId || canManage}
              onReply={() => setReplyTo(replyTo === thread.id ? null : thread.id)}
              onSave={(body, done) => mutations.update.mutate({ commentId: thread.id, body }, { onSuccess: done, onError: fail("Couldn't save the comment") })}
              onDelete={() => mutations.remove.mutate(thread.id, { onError: fail("Couldn't delete the comment") })}
            />
            {(thread.replies.length > 0 || replyTo === thread.id) && (
              <ul className="ml-4 flex flex-col gap-3 border-l border-line pl-4">
                {thread.replies.map((reply) => (
                  <li key={reply.id}>
                    <CommentItem
                      comment={reply}
                      canEdit={reply.authorId === currentUserId}
                      canDelete={reply.authorId === currentUserId || canManage}
                      onSave={(body, done) => mutations.update.mutate({ commentId: reply.id, body }, { onSuccess: done, onError: fail("Couldn't save the comment") })}
                      onDelete={() => mutations.remove.mutate(reply.id, { onError: fail("Couldn't delete the comment") })}
                    />
                  </li>
                ))}
                {replyTo === thread.id && (
                  <li>
                    <Composer
                      autoFocus
                      label="Reply"
                      submitLabel="Reply"
                      busy={mutations.create.isPending}
                      onCancel={() => setReplyTo(null)}
                      onSubmit={(body, reset) =>
                        mutations.create.mutate({ body, parentId: thread.id }, { onSuccess: () => { reset(); setReplyTo(null); }, onError: fail("Couldn't post the reply") })
                      }
                    />
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <Composer
        label="Add a comment"
        submitLabel="Comment"
        busy={mutations.create.isPending}
        onSubmit={(body, reset) => mutations.create.mutate({ body }, { onSuccess: reset, onError: fail("Couldn't post the comment") })}
      />
    </div>
  );
}

interface ItemProps {
  comment: Comment | CommentThread;
  canEdit: boolean;
  canDelete: boolean;
  onReply?: () => void;
  onSave: (body: string, done: () => void) => void;
  onDelete: () => void;
}

function CommentItem({ comment, canEdit, canDelete, onReply, onSave, onDelete }: ItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (comment.deleted) return <p className="text-sm text-muted italic">This comment was deleted.</p>;

  return (
    <div className="flex gap-3">
      {comment.author ? <Avatar person={comment.author} size={28} /> : <span className="size-7 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{comment.author?.name ?? "Former member"}</span>{" "}
          <time dateTime={comment.createdAt} className="text-muted">{relativeTime(comment.createdAt)}</time>
          {comment.editedAt && <span className="text-muted"> (edited)</span>}
        </p>
        {editing ? (
          <div className="mt-1.5">
            <Composer
              autoFocus
              label="Edit comment"
              submitLabel="Save changes"
              initial={comment.body ?? ""}
              busy={false}
              onCancel={() => setEditing(false)}
              onSubmit={(body) => onSave(body, () => setEditing(false))}
            />
          </div>
        ) : (
          <>
            <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>
            <div className="mt-1 flex items-center gap-3 text-[13px] text-muted">
              {onReply && <button className="hover:text-ink hover:underline" onClick={onReply}>Reply</button>}
              {canEdit && <button className="hover:text-ink hover:underline" onClick={() => setEditing(true)}>Edit</button>}
              {canDelete &&
                (confirmDelete ? (
                  <span className="flex items-center gap-2">
                    <button className="font-medium text-signal hover:underline" onClick={onDelete}>Delete comment</button>
                    <button className="hover:text-ink hover:underline" onClick={() => setConfirmDelete(false)}>Keep</button>
                  </span>
                ) : (
                  <button className="hover:text-ink hover:underline" onClick={() => setConfirmDelete(true)}>Delete</button>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface ComposerProps {
  label: string;
  submitLabel: string;
  initial?: string;
  busy: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSubmit: (body: string, reset: () => void) => void;
}

function Composer({ label, submitLabel, initial = "", busy, autoFocus, onCancel, onSubmit }: ComposerProps) {
  const [body, setBody] = useState(initial);
  const trimmed = body.trim();

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (trimmed && !busy) onSubmit(trimmed, () => setBody(""));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        autoFocus={autoFocus}
        aria-label={label}
        rows={3}
        maxLength={10_000}
        value={body}
        placeholder={label === "Add a comment" ? "Write a comment…" : undefined}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="w-full resize-y rounded-card border border-line bg-raised p-2.5 text-sm placeholder:text-muted/70 hover:border-line-strong focus-visible:border-accent focus-visible:outline-accent"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!trimmed}>{submitLabel}</Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <span className="ml-auto hidden text-xs text-muted sm:inline">Ctrl+Enter to send</span>
      </div>
    </form>
  );
}
