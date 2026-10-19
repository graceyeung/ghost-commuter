import { DAYS, type DayOfWeek } from "@/lib/api/contract";
import { DAY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/cn";

export function DaySelector({ value, onChange, disabled }: { value: DayOfWeek | null; onChange: (day: DayOfWeek | null) => void; disabled?: boolean }) {
  const options: (DayOfWeek | null)[] = [null, ...DAYS];
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold">Which night?</legend>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {options.map((day) => {
          const checked = value === day;
          const label = day ? DAY_LABELS[day].short : "Any night";
          return (
            <label
              key={day ?? "any"}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl border px-3.5 text-sm font-semibold transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-amber",
                checked ? "border-amber bg-amber/15 text-ink" : "border-border text-muted hover:text-ink",
              )}
            >
              <input type="radio" name="day" className="sr-only" checked={checked} onChange={() => onChange(day)} />
              <span aria-hidden={day ? true : undefined}>{label}</span>
              {day && <span className="sr-only">{DAY_LABELS[day].long}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
