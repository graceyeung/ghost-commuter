import { z } from "zod";
import { GenderIdentitySchema, GenderPreferenceSchema, LanguageInSchema, LanguageMatchingSchema, SafetyTagSchema } from "@/lib/api/contract";
import { detectPii } from "@/lib/pii";
import { isKnownStation } from "@/lib/stations";

const noPii = (text: string) => detectPii(text).length === 0;
const PII_MESSAGE = "Please remove the address or contact detail before continuing.";

export const joinSchema = z.object({
  // Step 1: About you
  uniAffiliation: z.string().trim().min(2, "Tell us which university you're at.").max(80),
  universityHub: z.string().refine(isKnownStation, "Choose the station nearest your campus from the list."),
  uniEmail: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.ac\.uk$/i, "Use your university email (it ends in .ac.uk)."),
  emailVerified: z.boolean().refine((v) => v, "Verify your university email to continue."),
  genderIdentity: GenderIdentitySchema,
  genderPreference: GenderPreferenceSchema,
  // Step 2: Your commute
  homeStation: z.string().refine(isKnownStation, "Choose your home station from the list."),
  commuteText: z
    .string()
    .trim()
    .min(15, "Add a little more: where you leave from, roughly when, and which nights.")
    .max(1200, "Please keep it under 1,200 characters.")
    .refine(noPii, PII_MESSAGE),
  // Step 3: Safety and study
  safetyPreferences: z.array(SafetyTagSchema),
  studyInterests: z.array(z.string().min(1).max(40)).max(8, "Up to 8 interests."),
  bio: z.string().max(600, "Please keep it under 600 characters.").refine(noPii, PII_MESSAGE),
  // Optional, opt-in: languages spoken and how much they should matter.
  languages: z.array(LanguageInSchema).max(12, "Up to 12 languages."),
  languageMatching: LanguageMatchingSchema,
  shareLanguages: z.boolean(),
});

export type JoinForm = z.infer<typeof joinSchema>;

export const STEP_FIELDS: readonly (readonly (keyof JoinForm)[])[] = [
  ["uniAffiliation", "universityHub", "uniEmail", "emailVerified", "genderIdentity", "genderPreference"],
  ["homeStation", "commuteText"],
  ["safetyPreferences", "studyInterests", "bio", "languages", "languageMatching", "shareLanguages"],
];

export const JOIN_DEFAULTS: JoinForm = {
  uniAffiliation: "",
  universityHub: "",
  uniEmail: "",
  emailVerified: false,
  genderIdentity: "undisclosed",
  genderPreference: "any",
  homeStation: "",
  commuteText: "",
  safetyPreferences: ["well_lit", "staffed_station"],
  studyInterests: [],
  bio: "",
  languages: [],
  languageMatching: "prefer_shared",
  shareLanguages: true,
};

export const COMMUTE_EXAMPLES: readonly { text: string; home: string }[] = [
  {
    text: "I leave King's Cross around 9:15pm on Tuesdays and Thursdays to head home towards Acton Town via the Piccadilly line.",
    home: "Acton Town",
  },
  {
    text: "Most weeknights I get the Victoria line from Euston to Finsbury Park at about 10:30pm after the studio closes.",
    home: "Finsbury Park",
  },
  {
    text: "Fridays after the library shuts, Holborn to Stratford on the Central line, usually around 11:45pm.",
    home: "Stratford",
  },
  {
    text: "Sometime in the evening on Wednesdays I go from Temple to Upminster on the District line.",
    home: "Upminster",
  },
];

export const INTEREST_SUGGESTIONS = ["statistics", "machine learning", "law", "economics", "history", "urban planning", "medicine", "design"] as const;
