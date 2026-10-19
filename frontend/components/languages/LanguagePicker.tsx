"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Plus, Search, X } from "lucide-react";
import { LANGUAGE_PROFICIENCIES, type Language, type LanguageIn, type LanguageProficiency } from "@/lib/api/contract";
import { PROFICIENCY_LABELS, languageName } from "@/lib/languages";
import { useSupportedLanguages } from "@/hooks/useSupportedLanguages";
import { inputClasses } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export interface LanguagePickerProps {
  id: string;
  value: LanguageIn[];
  onChange: (languages: LanguageIn[]) => void;
  max?: number;
  describedBy?: string;
}

/** Searchable multi-select (combobox + listbox) with a proficiency choice per chosen language. */
export function LanguagePicker({ id, value, onChange, max = 12, describedBy }: LanguagePickerProps) {
  const supported = useSupportedLanguages();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const full = value.length >= max;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(value.map((l) => l.code));
    return supported.filter((l) => !chosen.has(l.code) && (!q || l.name.toLowerCase().includes(q))).slice(0, 8);
  }, [query, supported, value]);

  const add = (lang: Language) => {
    if (full || value.some((l) => l.code === lang.code)) return;
    onChange([...value, { code: lang.code, proficiency: "fluent" }]);
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const option = options[active];
      if (open && option) {
        event.preventDefault();
        add(option);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const setProficiency = (code: string, proficiency: LanguageProficiency) =>
    onChange(value.map((l) => (l.code === code ? { ...l, proficiency } : l)));

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="space-y-2" aria-label="Languages you speak">
          {value.map((lang) => {
            const name = languageName(lang.code, supported);
            return (
              <li key={lang.code} className="flex flex-wrap items-center gap-2 rounded-xl border border-info/40 bg-info/10 p-2 pl-3">
                <span className="font-semibold text-ink">{name}</span>
                <label className="sr-only" htmlFor={`${id}-${lang.code}-level`}>
                  How well you speak {name}
                </label>
                <select
                  id={`${id}-${lang.code}-level`}
                  value={lang.proficiency}
                  onChange={(e) => setProficiency(lang.code, e.target.value as LanguageProficiency)}
                  className="ml-auto min-h-10 rounded-lg border border-border bg-bg/60 px-2 text-sm text-ink"
                >
                  {LANGUAGE_PROFICIENCIES.map((p) => (
                    <option key={p} value={p}>
                      {PROFICIENCY_LABELS[p]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((l) => l.code !== lang.code))}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-info/20 hover:text-ink"
                >
                  <X className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Remove {name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${options[active].code}` : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          disabled={full}
          value={query}
          placeholder={full ? `Up to ${max} languages` : "Search languages, e.g. Bengali"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className={cn(inputClasses, "min-h-12 pl-10")}
        />
        {open && options.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Matching languages" className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface p-1 shadow-card">
            {options.map((option, index) => (
              <li
                key={option.code}
                id={`${listId}-${option.code}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(option)}
                className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3", index === active ? "bg-surface-2 text-ink" : "text-muted")}
              >
                <Plus className="h-4 w-4" aria-hidden />
                {option.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
