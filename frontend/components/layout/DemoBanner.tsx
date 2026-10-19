import { FlaskConical } from "lucide-react";
import { env } from "@/lib/env";

export function DemoBanner() {
  if (!env.useMocks) return null;
  return (
    <div className="relative z-40 border-b border-amber/30 bg-amber/10 px-4 py-2 text-center text-xs font-semibold text-amber-text sm:text-sm">
      <FlaskConical className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />
      Demo mode: every student and match here is made up, and your answers stay in this browser.
    </div>
  );
}
