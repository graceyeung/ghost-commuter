/**
 * A faint line-diagram backdrop: a few route lines with station ticks, like a tube map seen through
 * a misted window. Decorative only; very low contrast so it never competes with content.
 */
export function GhostBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full glow-amber opacity-60 dark:opacity-100" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.07] dark:opacity-[0.09]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 800">
        <g fill="none" stroke="rgb(var(--ink))" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-20 180 H260 L380 300 H820" />
          <path d="M120 -20 V240 L260 380 V820" />
          <path d="M-20 560 H300 L420 440 H560 L700 300 V-20" />
          <path d="M520 820 V620 L640 500 H820" />
        </g>
        <g fill="rgb(var(--bg))" stroke="rgb(var(--ink))" strokeWidth="4">
          <circle cx="260" cy="180" r="10" />
          <circle cx="380" cy="300" r="10" />
          <circle cx="120" cy="240" r="10" />
          <circle cx="260" cy="380" r="10" />
          <circle cx="420" cy="440" r="10" />
          <circle cx="560" cy="440" r="10" />
          <circle cx="700" cy="300" r="10" />
          <circle cx="640" cy="500" r="10" />
        </g>
      </svg>
    </div>
  );
}
