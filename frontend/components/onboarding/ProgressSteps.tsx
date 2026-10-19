import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export function ProgressSteps({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <nav aria-label="Sign-up progress">
      <p className="mb-3 text-sm text-muted">
        Step {Math.min(current + 1, steps.length)} of {steps.length}
      </p>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((label, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={label} aria-current={active ? "step" : undefined} className="min-w-0">
              <div className={cn("h-1.5 rounded-full transition-colors", done || active ? "bg-amber" : "bg-surface-2")} />
              <p className={cn("mt-2 flex items-center gap-1 truncate text-xs font-semibold sm:text-sm", active ? "text-ink" : "text-muted")}>
                {done && <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />}
                <span className="truncate">{label}</span>
                {done && <span className="sr-only">(done)</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
