import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "drawer" slides in from the right (task details); "centered" is a small modal (forms). */
  variant?: "centered" | "drawer";
  children: ReactNode;
}

/**
 * Built on the native <dialog> element: the browser provides the focus trap, Escape to close,
 * focus restore and an inert page behind it — all things that are easy to get subtly wrong by hand.
 */
export function Dialog({ open, onClose, title, variant = "centered", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(variant === "drawer" ? "drawer" : "centered", "p-0")}
      onClose={onClose} // fires for Escape and for .close()
      // Close on a backdrop click, but not when a text selection started inside and ended outside.
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressedOnBackdrop.current) onClose();
      }}
    >
      {open && (
        <div className={cn("flex flex-col", variant === "drawer" && "h-full")}>
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
            <h2 id={titleId} className="font-display text-lg font-semibold">
              {title}
            </h2>
            <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="!px-1.5">
              <X className="size-4" aria-hidden />
            </Button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
