import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/** A textarea that grows with its content, so long titles wrap instead of scrolling inside a tiny box. */
export function AutoTextarea({ value, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return <textarea ref={ref} rows={1} value={value} className={cn("resize-none overflow-hidden", className)} {...rest} />;
}
