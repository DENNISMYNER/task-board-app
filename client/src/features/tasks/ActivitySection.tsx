import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { PageSpinner } from "../../components/ui/Spinner";
import type { Member } from "../../lib/api";
import { describeActivity, relativeTime } from "../../lib/format";
import { useTaskActivity } from "./hooks";

export function ActivitySection({ taskId, members }: { taskId: string; members: Member[] }) {
  const { data, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } = useTaskActivity(taskId);
  const nameOf = (userId: string) => members.find((m) => m.user.id === userId)?.user.name;

  if (isPending) return <PageSpinner label="Loading activity" />;
  if (isError)
    return (
      <p className="py-6 text-sm text-muted">
        Couldn't load activity. <button className="font-medium text-accent hover:underline" onClick={() => void refetch()}>Try again</button>
      </p>
    );

  const items = data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <p className="text-sm text-muted">Nothing has happened to this task yet.</p>;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 text-sm">
            {item.actor ? <Avatar person={item.actor} size={22} /> : <span className="size-[22px] shrink-0" />}
            <p className="min-w-0 flex-1 leading-snug">
              <span className="font-medium">{item.actor?.name ?? "Someone"}</span> {describeActivity(item, nameOf)}{" "}
              <time dateTime={item.createdAt} className="text-muted">{relativeTime(item.createdAt)}</time>
            </p>
          </li>
        ))}
      </ol>
      {hasNextPage && (
        <Button size="sm" className="self-start" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          Show older activity
        </Button>
      )}
    </div>
  );
}
