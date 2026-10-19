import type { TrustSummary } from "./api/contract";

/** Mirror of TRUST_TIERS in the backend's config.py (minimum journeys, key, label). Ascending. */
export const TRUST_TIERS = [
  { min: 0, tier: "new", label: "New" },
  { min: 1, tier: "first_steps", label: "First steps" },
  { min: 5, tier: "regular", label: "Regular" },
  { min: 10, tier: "trusted", label: "Trusted" },
  { min: 25, tier: "commute_veteran", label: "Commute veteran" },
] as const;

export type TrustTier = (typeof TRUST_TIERS)[number]["tier"];

export function trustSummary(count: number): TrustSummary {
  const n = Math.max(0, Math.floor(count));
  const current = [...TRUST_TIERS].reverse().find((t) => n >= t.min) ?? TRUST_TIERS[0];
  const next = TRUST_TIERS.find((t) => t.min > n);
  return { journeys_completed: n, tier: current.tier, tier_label: current.label, next_tier_at: next?.min ?? null };
}

/** The tier key for a label from the API (labels are what participants_trust carries). */
export function tierForLabel(label: string): TrustTier | null {
  return TRUST_TIERS.find((t) => t.label === label)?.tier ?? null;
}

/** Progress (0-1) from the start of the current tier to the next one, plus a plain-language line. */
export function tierProgress(summary: TrustSummary): { fraction: number; text: string } {
  if (summary.next_tier_at === null) return { fraction: 1, text: "Top tier reached. Thanks for looking out for each other." };
  const current = TRUST_TIERS.find((t) => t.label === summary.tier_label) ?? TRUST_TIERS[0];
  const next = TRUST_TIERS.find((t) => t.min === summary.next_tier_at);
  const span = summary.next_tier_at - current.min;
  const done = summary.journeys_completed - current.min;
  const remaining = summary.next_tier_at - summary.journeys_completed;
  return {
    fraction: span > 0 ? Math.min(1, Math.max(0, done / span)) : 0,
    text: `${remaining} more ${remaining === 1 ? "journey" : "journeys"} to ${next?.label ?? "the next tier"}`,
  };
}

export function journeysText(count: number): string {
  return `${count} ${count === 1 ? "journey" : "journeys"}`;
}
