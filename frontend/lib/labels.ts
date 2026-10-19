import type { DayOfWeek, GenderIdentity, GenderPreference, MatchType, ReportReason, SafetyTag } from "./api/contract";

export const DAY_LABELS: Record<DayOfWeek, { short: string; long: string }> = {
  mon: { short: "Mon", long: "Monday" },
  tue: { short: "Tue", long: "Tuesday" },
  wed: { short: "Wed", long: "Wednesday" },
  thu: { short: "Thu", long: "Thursday" },
  fri: { short: "Fri", long: "Friday" },
  sat: { short: "Sat", long: "Saturday" },
  sun: { short: "Sun", long: "Sunday" },
};

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  walk_home_pair: "Walk-home pair",
  study_group: "Study group",
};

export const SAFETY_TAG_LABELS: Record<SafetyTag, { label: string; hint: string }> = {
  well_lit: { label: "Well-lit routes", hint: "Prefer main roads and lit paths for the last stretch home." },
  staffed_station: { label: "Staffed stations", hint: "Meet and get off at stations with staff on late." },
  avoid_isolated_exits: { label: "Avoid quiet exits", hint: "Leave by the main exit, not side or back exits." },
  busy_carriage: { label: "Busier carriages", hint: "Sit where there are more people around." },
  cctv: { label: "CCTV on platforms", hint: "Meet under or near a camera." },
  short_last_mile: { label: "Short walk at the end", hint: "Favour matches with a short walk from the station." },
  night_tube_only: { label: "Night Tube only", hint: "Only suggest journeys on lines that run all night." },
};

export function safetyTagLabel(tag: string): string {
  return tag in SAFETY_TAG_LABELS ? SAFETY_TAG_LABELS[tag as SafetyTag].label : tag.replace(/_/g, " ");
}

export const GENDER_PREFERENCE_LABELS: Record<GenderPreference, { label: string; hint: string }> = {
  any: { label: "Anyone", hint: "You can be matched with any student." },
  women_only: { label: "Women only", hint: "Only match me with women." },
  men_only: { label: "Men only", hint: "Only match me with men." },
  non_binary_inclusive: { label: "Women and non-binary people", hint: "Only match me with women and non-binary students." },
};

export const GENDER_IDENTITY_LABELS: Record<GenderIdentity, string> = {
  undisclosed: "Prefer not to say",
  woman: "Woman",
  man: "Man",
  non_binary: "Non-binary",
};

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  made_me_uncomfortable: "Made me feel uncomfortable",
  no_show_or_unreliable: "Didn't turn up or was unreliable",
  inappropriate_messages: "Sent inappropriate messages",
  shared_personal_info: "Asked for or shared personal details",
  safety_concern: "I'm worried about someone's safety",
  other: "Something else",
};

export function formatDays(days: readonly DayOfWeek[]): string {
  if (days.length === 7) return "Every night";
  const weekdays: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
  if (days.length === 5 && weekdays.every((d) => days.includes(d))) return "Weeknights";
  return days.map((d) => DAY_LABELS[d].short).join(", ");
}

/** "Lunar Hare & Mossy Otter" / "A, B & C" */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function modeLabel(mode: string): string {
  if (mode === "mock") return "Demo data";
  if (mode === "rule_based") return "Rule-based matching";
  return "Claude-assisted";
}
