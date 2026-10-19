import { lineColour, splitLines } from "@/lib/lineColours";
import { cn } from "@/lib/cn";

/** TfL-style line pill(s) using approximate colours. Accepts "Victoria / Piccadilly" and renders two. */
export function LinePills({ sharedLine, className }: { sharedLine: string; className?: string }) {
  const lines = splitLines(sharedLine);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {lines.map((line) => (
        <LinePill key={line} line={line} />
      ))}
    </span>
  );
}

export function LinePill({ line }: { line: string }) {
  const { background, text } = lineColour(line);
  const label = /line$/i.test(line) || /overground|dlr/i.test(line) ? line : `${line} line`;
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold tracking-wide ring-1 ring-inset ring-white/15"
      style={{ backgroundColor: background, color: text }}
    >
      {label}
    </span>
  );
}
