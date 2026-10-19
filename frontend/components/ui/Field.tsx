import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + hint + error wrapper. Inputs reference `${id}-hint` / `${id}-error` via aria-describedby. */
export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {optional && <span className="ml-2 font-normal text-muted">(optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, opts: { hint?: boolean; error?: boolean; extra?: string }): string | undefined {
  const ids = [opts.hint && `${id}-hint`, opts.error && `${id}-error`, opts.extra].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}
