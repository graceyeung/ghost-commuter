"use client";

import { forwardRef, useId, useMemo, useState, type KeyboardEvent } from "react";
import { TrainFront } from "lucide-react";
import { searchStations } from "@/lib/stations";
import { LinePill } from "./LinePill";
import { cn } from "@/lib/cn";
import { inputClasses } from "@/components/ui/Input";

export interface StationComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}

/** ARIA 1.2 combobox with a listbox popup, filtered from the local station list. */
export const StationCombobox = forwardRef<HTMLInputElement, StationComboboxProps>(function StationCombobox(
  { id, value, onChange, onBlur, placeholder = "Start typing a station", invalid, describedBy },
  ref,
) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = useMemo(() => searchStations(value, 8), [value]);
  const activeOption = options[active];

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && activeOption) {
      event.preventDefault();
      choose(activeOption.name);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <TrainFront className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={ref}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && activeOption ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        className={cn(inputClasses, "min-h-12 pl-12")}
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Stations"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-card"
        >
          {options.map((station, index) => (
            <li
              key={station.name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown (not click) so the choice lands before the input's blur closes the list
              onMouseDown={(event) => {
                event.preventDefault();
                choose(station.name);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5",
                index === active ? "bg-surface-2" : "",
              )}
            >
              <span className="font-semibold">
                {station.name}
                {station.zone !== undefined && <span className="ml-2 text-xs font-normal text-muted">Zone {station.zone}</span>}
              </span>
              <span className="flex flex-wrap gap-1">
                {station.lines.slice(0, 2).map((line) => (
                  <LinePill key={line} line={line} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
