import type { ReactNode } from "react";

/** An empty screen is an invitation: say what is missing and offer the next step. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {children && <div className="text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
