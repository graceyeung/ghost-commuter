import type { Language, LanguageMatching, LanguageProficiency } from "./api/contract";

/**
 * Mirror of the backend's supported list (languages.py), used by the mock client and as a fallback
 * while GET /api/commuter/languages loads. The backend list is the source of truth.
 */
export const SUPPORTED_LANGUAGES: readonly Language[] = [
  { code: "am", name: "Amharic" },
  { code: "ar", name: "Arabic" },
  { code: "bn", name: "Bengali" },
  { code: "bfi", name: "British Sign Language" },
  { code: "bg", name: "Bulgarian" },
  { code: "yue", name: "Cantonese" },
  { code: "cs", name: "Czech" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "gu", name: "Gujarati" },
  { code: "ha", name: "Hausa" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "ig", name: "Igbo" },
  { code: "id", name: "Indonesian" },
  { code: "ga", name: "Irish" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ku", name: "Kurdish" },
  { code: "lt", name: "Lithuanian" },
  { code: "ms", name: "Malay" },
  { code: "ml", name: "Malayalam" },
  { code: "zh", name: "Mandarin Chinese" },
  { code: "ne", name: "Nepali" },
  { code: "fa", name: "Persian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "pa", name: "Punjabi" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "si", name: "Sinhala" },
  { code: "so", name: "Somali" },
  { code: "es", name: "Spanish" },
  { code: "sw", name: "Swahili" },
  { code: "syl", name: "Sylheti" },
  { code: "tl", name: "Tagalog" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "th", name: "Thai" },
  { code: "ti", name: "Tigrinya" },
  { code: "tr", name: "Turkish" },
  { code: "tw", name: "Twi" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "vi", name: "Vietnamese" },
  { code: "cy", name: "Welsh" },
  { code: "yo", name: "Yoruba" },
];

export function languageName(code: string, list: readonly Language[] = SUPPORTED_LANGUAGES): string {
  return list.find((l) => l.code === code)?.name ?? code;
}

export const PROFICIENCY_LABELS: Record<LanguageProficiency, string> = {
  native: "Native",
  fluent: "Fluent",
  conversational: "Conversational",
};

export const LANGUAGE_MATCHING_LABELS: Record<LanguageMatching, { label: string; hint: string }> = {
  off: {
    label: "Doesn't matter",
    hint: "We won't use your languages at all, and nobody sees them.",
  },
  prefer_shared: {
    label: "Prefer a shared language",
    hint: "Anyone can still match with you. If you share a language, we'll mention it.",
  },
  require_shared: {
    label: "Only match me with a shared language",
    hint: "You'll only see people who speak at least one of your languages. You may see fewer matches.",
  },
};

/** "Bengali, English" */
export function languageList(languages: readonly { name: string }[]): string {
  return languages.map((l) => l.name).join(", ");
}
