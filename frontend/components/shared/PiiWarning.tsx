import { MapPinOff } from "lucide-react";
import { detectPii, piiMessage } from "@/lib/pii";

/** Live warning shown under free-text fields when the text looks like it contains an address or contact detail. */
export function PiiWarning({ id, text }: { id: string; text: string }) {
  const findings = detectPii(text);
  return (
    <div id={id} aria-live="polite">
      {findings.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-medium text-danger">
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{piiMessage(findings)}</span>
        </p>
      )}
    </div>
  );
}
