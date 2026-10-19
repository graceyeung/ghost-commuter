"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, hint, disabled, id }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-bg/40 p-4">
      <div className="min-w-0">
        <label htmlFor={switchId} className="block cursor-pointer font-semibold text-ink">
          {label}
        </label>
        {hint && (
          <p id={`${switchId}-hint`} className="mt-1 text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${switchId}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-amber bg-amber" : "border-border bg-surface-2",
          disabled && "opacity-60",
        )}
      >
        <span className="sr-only">{checked ? "On" : "Off"}</span>
        <span
          aria-hidden
          className={cn(
            "inline-block h-5 w-5 rounded-full shadow transition-transform motion-reduce:transition-none",
            checked ? "translate-x-6 bg-on-amber" : "translate-x-1 bg-muted",
          )}
        />
      </button>
    </div>
  );
}
