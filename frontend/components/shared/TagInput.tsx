"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { inputClasses } from "@/components/ui/Input";

export interface TagInputProps {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
  max?: number;
  describedBy?: string;
  placeholder?: string;
}

/** Free-text tags (Enter or comma to add) plus one-tap suggestions. Tags are lower-cased like the backend does. */
export function TagInput({ id, value, onChange, suggestions = [], max = 8, describedBy, placeholder = "e.g. statistics" }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const full = value.length >= max;

  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase().slice(0, 40);
    if (!tag || value.includes(tag) || full) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const remaining = suggestions.filter((s) => !value.includes(s));

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Your study interests">
          {value.map((tag) => (
            <li key={tag}>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-amber/10 py-1 pl-3 pr-1 text-sm font-semibold text-amber-text">
                {tag}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((t) => t !== tag))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-amber/20"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Remove {tag}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          disabled={full}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={describedBy}
          placeholder={full ? `Up to ${max} interests` : placeholder}
          className={cn(inputClasses, "min-h-12 flex-1")}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim() || full}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 font-semibold text-ink hover:border-amber/60 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </button>
      </div>
      {remaining.length > 0 && !full && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Popular</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="min-h-9 rounded-full border border-border px-3 text-sm text-ink hover:border-amber/60 hover:bg-surface-2"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
