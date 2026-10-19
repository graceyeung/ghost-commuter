"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = [
  { title: "Understanding your schedule", detail: "Reading your times, nights and line." },
  { title: "Checking routes and safety", detail: "Finding who shares your line, and which stations are staffed and well lit." },
  { title: "Finding good matches", detail: "Weighing timing, stops, study interests and everyone's preferences." },
] as const;

/**
 * The backend runs these three stages in order but doesn't stream progress, so the steps advance
 * on a gentle timer and the last one stays active until the response arrives. The copy says so.
 */
export function PipelineLoader() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timers = [setTimeout(() => setActive(1), 900), setTimeout(() => setActive(2), 2200)];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div role="status" aria-live="polite" aria-busy="true" className="rounded-2xl border border-border bg-surface/90 p-5 sm:p-6">
      <p className="sr-only">Looking for commute buddies. Step {active + 1} of 3: {STEPS[active]?.title}.</p>
      <ol className="space-y-5" aria-hidden>
        {STEPS.map((step, index) => {
          const state = index < active ? "done" : index === active ? "active" : "todo";
          return (
            <li key={step.title} className="flex gap-4">
              <span className="mt-0.5">
                {state === "done" && <CheckCircle2 className="h-6 w-6 text-success" />}
                {state === "active" && <Loader2 className="h-6 w-6 animate-spin text-amber-text motion-reduce:animate-none" />}
                {state === "todo" && <Circle className="h-6 w-6 text-border" />}
              </span>
              <span>
                <span className={cn("block font-semibold", state === "todo" ? "text-muted" : "text-ink")}>{step.title}</span>
                <span className="block text-sm text-muted">{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-xs text-muted">These are the stages the matcher works through. It can take up to a minute when routes are checked carefully.</p>
    </div>
  );
}
