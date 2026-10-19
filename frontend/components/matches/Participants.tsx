import type { ParticipantTrust } from "@/lib/api/contract";
import { TrustBadge } from "@/components/trust/TrustBadge";

/** Each other participant's anonymous name with their trust badge (count and tier only). */
export function Participants({ names, trust, label = "Who's in this match" }: { names: readonly string[]; trust: readonly ParticipantTrust[]; label?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={label}>
      {names.map((name) => {
        const badge = trust.find((t) => t.display_name === name);
        return (
          <li key={name} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{name}</span>
            {badge && <TrustBadge displayName={name} journeysCompleted={badge.journeys_completed} tierLabel={badge.tier_label} />}
          </li>
        );
      })}
    </ul>
  );
}
