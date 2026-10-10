import type { Person } from "../../lib/api";
import { cn } from "./cn";

// A stable colour per person, derived from their id, so the same teammate always looks the same.
function hueOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  return hash;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({ person, size = 24, className }: { person: Pick<Person, "id" | "name" | "avatarUrl">; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (person.avatarUrl) {
    return <img src={person.avatarUrl} alt="" title={person.name} style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      title={person.name}
      aria-hidden
      style={{ ...style, background: `hsl(${hueOf(person.id)} 38% 34%)` }}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none", className)}
    >
      {initials(person.name)}
    </span>
  );
}
