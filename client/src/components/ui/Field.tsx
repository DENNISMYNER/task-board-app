import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-md border border-line bg-raised px-3 text-sm text-ink placeholder:text-muted/70 " +
  "transition-colors hover:border-line-strong focus-visible:border-accent focus-visible:outline-accent " +
  "disabled:opacity-60 aria-[invalid=true]:border-signal";

interface FieldShellProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  hideLabel?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

function FieldShell({ label, error, hint, hideLabel, children }: FieldShellProps) {
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn("text-sm font-medium", hideLabel && "sr-only")}>
        {label}
      </label>
      {children({ id, describedBy: message ? messageId : undefined, invalid: Boolean(error) })}
      {message && (
        <p id={messageId} className={cn("text-[13px]", error ? "text-signal" : "text-muted")} role={error ? "alert" : undefined}>
          {message}
        </p>
      )}
    </div>
  );
}

type CommonProps = Pick<FieldShellProps, "label" | "error" | "hint" | "hideLabel">;

export function TextField({ label, error, hint, hideLabel, className, ...rest }: CommonProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} error={error} hint={hint} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid} className={cn(control, "h-9", className)} {...rest} />
      )}
    </FieldShell>
  );
}

export function TextArea({ label, error, hint, hideLabel, className, ...rest }: CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} error={error} hint={hint} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} className={cn(control, "min-h-20 resize-y py-2 leading-relaxed", className)} {...rest} />
      )}
    </FieldShell>
  );
}

export function SelectField({ label, error, hint, hideLabel, className, children, ...rest }: CommonProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} error={error} hint={hint} hideLabel={hideLabel}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid} className={cn(control, "h-9 pr-8", className)} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}
