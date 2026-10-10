import type { ActivityItem, Person } from "./api";

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dateYearFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const DAY = 86_400_000;

/** Calendar-day distance between a date and today (negative = in the past). */
function dayDiff(date: Date, now = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / DAY);
}

export interface DueInfo {
  label: string;
  tone: "overdue" | "soon" | "normal" | "done";
}

export function describeDue(iso: string, completed: boolean): DueInfo {
  const date = new Date(iso);
  const diff = dayDiff(date);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const base = (sameYear ? dateFmt : dateYearFmt).format(date);
  if (completed) return { label: base, tone: "done" };
  if (diff < 0) return { label: base, tone: "overdue" };
  if (diff <= 2) return { label: diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : base, tone: "soon" };
  return { label: base, tone: "normal" };
}

export function relativeTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
  return dateYearFmt.format(new Date(iso));
}

/** <input type="date"> value (YYYY-MM-DD, local) <-> the ISO-with-offset string the API requires. */
export function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Due dates are day-granular in the UI; we store them at local 17:00 so they don't flip day across timezones. */
export function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 17, 0, 0).toISOString();
}

const PRIORITY_LABEL = { NONE: "No priority", LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" } as const;
export const priorityLabel = (p: keyof typeof PRIORITY_LABEL) => PRIORITY_LABEL[p];

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const nested = (v: unknown, key: string): string | undefined =>
  typeof v === "object" && v !== null ? str((v as Record<string, unknown>)[key]) : undefined;

/** One readable sentence per audit-log entry, e.g. "moved this from Todo to In Progress". */
export function describeActivity(item: ActivityItem, nameOf: (userId: string) => string | undefined): string {
  const m = item.metadata ?? {};
  switch (item.action) {
    case "TASK_CREATED":
      return `created this in ${str(m.columnName) ?? "a column"}`;
    case "TASK_MOVED":
      return `moved this from ${nested(m.from, "name") ?? "a column"} to ${nested(m.to, "name") ?? "another"}`;
    case "TASK_UPDATED": {
      const fields = Array.isArray(m.changedFields) ? (m.changedFields as string[]) : [];
      if (fields.includes("title") && str(m.from) && str(m.to)) return `renamed this from “${str(m.from)}” to “${str(m.to)}”`;
      return fields.length ? `edited the ${fields.join(" and ")}` : "edited this";
    }
    case "TASK_PRIORITY_CHANGED": {
      const to = str(m.to) as keyof typeof PRIORITY_LABEL | undefined;
      return to ? `set priority to ${PRIORITY_LABEL[to]?.toLowerCase() ?? to}` : "changed the priority";
    }
    case "TASK_DUE_DATE_CHANGED": {
      const to = str(m.to);
      return to ? `set the due date to ${dateYearFmt.format(new Date(to))}` : "removed the due date";
    }
    case "TASK_ASSIGNED": {
      const who = str(m.to) ? nameOf(str(m.to) as string) : undefined;
      return who ? `assigned this to ${who}` : "assigned this";
    }
    case "TASK_UNASSIGNED":
      return "removed the assignee";
    case "TASK_ARCHIVED":
      return "archived this";
    case "TASK_DELETED":
      return `deleted ${str(m.key) ?? ""}-${String(m.taskNumber ?? "")}`.trim();
    case "COMMENT_CREATED":
      return m.parentId ? "replied to a comment" : "commented";
    case "COMMENT_UPDATED":
      return "edited a comment";
    case "COMMENT_DELETED":
      return "deleted a comment";
    case "COLUMN_CREATED":
      return `added the column ${str(m.name) ?? ""}`.trim();
    case "COLUMN_UPDATED":
      return str(m.from) && str(m.to) ? `renamed the column ${str(m.from)} to ${str(m.to)}` : "edited a column";
    case "COLUMN_REORDERED":
      return `reordered the column ${str(m.name) ?? ""}`.trim();
    case "COLUMN_DELETED":
      return `deleted the column ${str(m.name) ?? ""}`.trim();
    case "BOARD_CREATED":
      return "created this board";
    case "BOARD_UPDATED":
      return "edited this board";
    case "BOARD_ARCHIVED":
      return "archived this board";
    default:
      return item.action.toLowerCase().replaceAll("_", " ");
  }
}

export function personName(p: Person | null | undefined): string {
  return p?.name ?? "Someone";
}
