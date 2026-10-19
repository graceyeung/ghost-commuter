/**
 * Client-side check for things that look like an exact address or direct contact detail.
 * The backend also redacts these before storage; this warns earlier, before anything is sent.
 */
export type PiiKind = "postcode" | "house_number" | "email" | "phone";

export interface PiiFinding {
  kind: PiiKind;
  label: string;
}

// Full UK postcodes ("N4 3HF", "sw1a1aa"). Outward codes alone ("N4") are area-level and allowed.
const POSTCODE = /\b(?:GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/i;
// A number directly followed by a street name ("12 Elm Road", "4a Station Close", "flat 3").
const STREET_WORDS =
  "road|rd|street|avenue|ave|lane|ln|close|crescent|cres|drive|dr|way|gardens|gdns|grove|place|pl|court|ct|terrace|hill|square|sq|mews|walk|row|park|rise|parade|view|villas";
const HOUSE_NUMBER = new RegExp(
  `\\b\\d{1,4}[a-z]?,?\\s+(?:[a-z][a-z'’-]+\\s+){1,3}(?:${STREET_WORDS})\\b|\\b(?:flat|apartment|apt|unit)\\s*\\d+[a-z]?\\b`,
  "i",
);
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b|\b0[12]\d{2,3}\s?\d{3}\s?\d{3,4}\b/;

const LABELS: Record<PiiKind, string> = {
  postcode: "a full postcode",
  house_number: "a house number or street address",
  email: "an email address",
  phone: "a phone number",
};

export function detectPii(text: string): PiiFinding[] {
  if (!text) return [];
  const findings: PiiFinding[] = [];
  const add = (kind: PiiKind) => findings.push({ kind, label: LABELS[kind] });
  if (POSTCODE.test(text)) add("postcode");
  if (HOUSE_NUMBER.test(text)) add("house_number");
  if (EMAIL.test(text)) add("email");
  if (PHONE.test(text)) add("phone");
  return findings;
}

export function piiMessage(findings: PiiFinding[]): string {
  const parts = findings.map((f) => f.label);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
  return `This looks like it includes ${list}. Please remove it before continuing. Station names are all we need.`;
}

/** Replaces anything that looks like an address or contact detail (mirrors the backend's redaction; used by the mock). */
export function redactPii(text: string): string {
  let out = text;
  for (const re of [POSTCODE, HOUSE_NUMBER, EMAIL, PHONE]) out = out.replace(new RegExp(re.source, `${re.flags}g`), "[redacted]");
  return out;
}
