import { cn } from "@/lib/cn";

/** The ghost-on-a-line logo mark: a soft translucent figure standing on a route line. */
export function GhostMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden focusable="false">
      <path d="M2 27h28" stroke="rgb(var(--amber))" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="26" cy="27" r="2.6" fill="rgb(var(--bg))" stroke="rgb(var(--amber))" strokeWidth="2" />
      <path
        d="M9 23.5V13a7 7 0 0 1 14 0v10.5l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6z"
        fill="rgb(var(--ink) / 0.9)"
      />
      <circle cx="13.6" cy="13.4" r="1.25" fill="rgb(var(--bg))" />
      <circle cx="18.4" cy="13.4" r="1.25" fill="rgb(var(--bg))" />
    </svg>
  );
}
