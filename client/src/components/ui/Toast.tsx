import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

interface ToastInput {
  title: string;
  description?: string;
  tone?: "default" | "error" | "success";
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { ...input, id }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), input.tone === "error" ? 7000 : 4000);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live announces new toasts to screen readers without stealing focus */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-card border bg-raised px-4 py-3 text-sm shadow-lg",
              t.tone === "error" ? "border-signal" : t.tone === "success" ? "border-done" : "border-line-strong",
            )}
          >
            <p className="font-medium">{t.title}</p>
            {t.description && <p className="mt-0.5 text-muted">{t.description}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
