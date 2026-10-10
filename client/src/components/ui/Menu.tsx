import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "./cn";

interface MenuProps {
  /** Names the menu for screen readers. */
  label: string;
  /** Use when the trigger shows no text (an icon or an avatar). */
  triggerLabel?: string;
  trigger: ReactNode;
  triggerClassName?: string;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}

const ITEM = '[role^="menuitem"]:not([disabled])';

/**
 * A small dropdown menu following the WAI-ARIA menu-button pattern: arrow keys move between items,
 * Home/End jump, Escape closes and returns focus to the button, clicking elsewhere closes it.
 */
export function Menu({ label, triggerLabel, trigger, triggerClassName, align = "left", children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Closing from the keyboard or by choosing an item returns focus to the button. That is done in an
  // effect (not inside `close`) so `close` can be handed to children without touching a ref.
  const [returnFocus, setReturnFocus] = useState(0);
  const close = useCallback(() => {
    setOpen(false);
    setReturnFocus((n) => n + 1);
  }, []);
  useEffect(() => {
    if (returnFocus > 0) triggerRef.current?.focus();
  }, [returnFocus]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    listRef.current?.querySelector<HTMLElement>(ITEM)?.focus(); // keyboard users land on the first item
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const index = items.findIndex((el) => el === document.activeElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return focus(index + 1);
      case "ArrowUp":
        e.preventDefault();
        return focus(index - 1);
      case "Home":
        e.preventDefault();
        return focus(0);
      case "End":
        e.preventDefault();
        return focus(items.length - 1);
      case "Escape":
        e.preventDefault();
        return close();
      case "Tab":
        return setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={listId}
          ref={listRef}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute top-full z-30 mt-1.5 min-w-56 rounded-card border border-line bg-raised p-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
  /** "radio" items show a check when selected (used for choosing a workspace). */
  role?: "menuitem" | "menuitemradio";
  checked?: boolean;
  tone?: "default" | "danger";
}

export function MenuItem({ onSelect, children, role = "menuitem", checked, tone = "default" }: MenuItemProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitemradio" ? Boolean(checked) : undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none",
        tone === "danger" ? "text-signal" : "text-ink",
        checked && "font-medium",
      )}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />;
}
