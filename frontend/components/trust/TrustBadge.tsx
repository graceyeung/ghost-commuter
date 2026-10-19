"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Award, Footprints, Repeat, ShieldCheck, Sprout, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { journeysText, tierForLabel, type TrustTier } from "@/lib/trust";

const ICONS: Record<TrustTier, LucideIcon> = {
  new: Sprout,
  first_steps: Footprints,
  regular: Repeat,
  trusted: ShieldCheck,
  commute_veteran: Award,
};

export interface TrustBadgeProps {
  journeysCompleted: number;
  tierLabel: string;
  /** Whose badge this is, for screen readers ("Mossy Otter"); omit for your own. */
  displayName?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Tier label + icon + "N journeys", with a keyboard-focusable explanation. Meaning never relies on
 * colour alone: the label and count are always written out.
 */
export function TrustBadge({ journeysCompleted, tierLabel, displayName, size = "sm", className }: TrustBadgeProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const Icon = ICONS[tierForLabel(tierLabel) ?? "new"];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      // Close only the popover, not a surrounding dialog.
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus();
    }
  };

  const whose = displayName ? `${displayName}: ` : "";
  return (
    <span ref={wrapper} className={cn("relative inline-flex", className)} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${whose}${tierLabel}, ${journeysText(journeysCompleted)}. What does this mean?`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 font-semibold text-ink",
          "hover:border-success/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber",
          size === "sm" ? "min-h-7 px-2 text-xs" : "min-h-9 px-3 text-sm",
        )}
      >
        <Icon className={size === "sm" ? "h-3.5 w-3.5 text-success" : "h-4 w-4 text-success"} aria-hidden />
        <span>{tierLabel}</span>
        <span aria-hidden className="text-muted">
          · {journeysText(journeysCompleted)}
        </span>
      </button>
      {open && (
        <span
          id={popoverId}
          role="note"
          className="absolute left-0 top-full z-30 mt-2 block w-64 rounded-xl border border-border bg-surface p-3 text-left text-sm font-normal text-ink shadow-card"
        >
          <span className="block font-semibold">
            {tierLabel} · {journeysText(journeysCompleted)}
          </span>
          <span className="mt-1 block text-muted">
            Counted only when both of you confirm you travelled together. We never show when, where or with whom.
          </span>
        </span>
      )}
    </span>
  );
}
