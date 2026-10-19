/**
 * Night platform illustration: a route line with stations, a lit platform marker and two soft,
 * translucent ghost figures waiting together. Decorative, so hidden from assistive tech.
 */
export function HeroScene() {
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-6 rounded-full glow-amber" />
      <svg viewBox="0 0 400 400" className="relative h-full w-full">
        <defs>
          <linearGradient id="ghost-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--ink))" stopOpacity="0.85" />
            <stop offset="100%" stopColor="rgb(var(--ink))" stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgb(var(--amber))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="rgb(var(--amber))" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* route line */}
        <path d="M20 300 H150 L210 240 H380" fill="none" stroke="rgb(var(--amber))" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d="M60 80 V200 L120 260 V380" fill="none" stroke="rgb(var(--muted))" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
        {[60, 150, 300].map((x) => (
          <circle key={x} cx={x} cy={x === 300 ? 240 : 300} r="11" fill="rgb(var(--bg))" stroke="rgb(var(--amber))" strokeWidth="5" />
        ))}
        <circle cx="120" cy="260" r="11" fill="rgb(var(--bg))" stroke="rgb(var(--muted))" strokeWidth="5" opacity="0.6" />

        {/* platform lamp */}
        <circle cx="300" cy="96" r="70" fill="url(#lamp)" className="animate-flicker motion-reduce:animate-none" />
        <path d="M300 104 V226" stroke="rgb(var(--muted))" strokeWidth="4" opacity="0.6" />
        <rect x="282" y="88" width="36" height="16" rx="5" fill="rgb(var(--amber))" />

        {/* two ghosts waiting at the station */}
        <g transform="translate(222 140)">
          <path d="M0 86 V34 a28 28 0 0 1 56 0 V86 l-9.3 -7 -9.3 7 -9.4 -7 -9.3 7 -9.4 -7z" fill="url(#ghost-fill)" />
          <circle cx="19" cy="34" r="4" fill="rgb(var(--bg))" />
          <circle cx="37" cy="34" r="4" fill="rgb(var(--bg))" />
        </g>
        <g transform="translate(316 158)" opacity="0.8">
          <path d="M0 68 V26 a22 22 0 0 1 44 0 V68 l-7.3 -5.5 -7.4 5.5 -7.3 -5.5 -7.3 5.5 -7.4 -5.5z" fill="url(#ghost-fill)" />
          <circle cx="15" cy="27" r="3.2" fill="rgb(var(--bg))" />
          <circle cx="29" cy="27" r="3.2" fill="rgb(var(--bg))" />
        </g>
      </svg>
    </div>
  );
}
