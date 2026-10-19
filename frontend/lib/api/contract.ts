/**
 * Ghost Commuter API contract: the single source of truth for request/response shapes.
 *
 * Mirrors the FastAPI backend's `schemas.py`. Every response is parsed with these Zod schemas
 * before the UI sees it. If the backend contract changes, this is the only file to edit.
 *
 * Sections:
 *   1. Enums
 *   2. Live endpoints (implemented in the backend today)
 *   2b. My matches + in-app chat (live)
 *   2c. Trust badges + journeys, languages (live)
 *   3. PROPOSED endpoints (not yet in backend; mocked, or saved on this device when the backend 404s)
 *   4. The GhostApi interface both the HTTP client and the mock client implement
 */
import { z } from "zod";

// ------------------------------------------------------------------------------------ 1. Enums
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DayOfWeekSchema = z.enum(DAYS);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

export const GENDER_IDENTITIES = ["woman", "man", "non_binary", "undisclosed"] as const;
export const GenderIdentitySchema = z.enum(GENDER_IDENTITIES);
export type GenderIdentity = z.infer<typeof GenderIdentitySchema>;

export const GENDER_PREFERENCES = ["any", "women_only", "men_only", "non_binary_inclusive"] as const;
export const GenderPreferenceSchema = z.enum(GENDER_PREFERENCES);
export type GenderPreference = z.infer<typeof GenderPreferenceSchema>;

export const SAFETY_TAGS = [
  "well_lit",
  "staffed_station",
  "cctv",
  "night_tube_only",
  "short_last_mile",
  "busy_carriage",
  "avoid_isolated_exits",
] as const;
export const SafetyTagSchema = z.enum(SAFETY_TAGS);
export type SafetyTag = z.infer<typeof SafetyTagSchema>;

export const MATCH_TYPES = ["walk_home_pair", "study_group"] as const;
export const MatchTypeSchema = z.enum(MATCH_TYPES);
export type MatchType = z.infer<typeof MatchTypeSchema>;

export const LANGUAGE_PROFICIENCIES = ["native", "fluent", "conversational"] as const;
export const LanguageProficiencySchema = z.enum(LANGUAGE_PROFICIENCIES);
export type LanguageProficiency = z.infer<typeof LanguageProficiencySchema>;

/** off: languages never used or shown · prefer_shared: soft signal · require_shared: filter. */
export const LANGUAGE_MATCHING = ["off", "prefer_shared", "require_shared"] as const;
export const LanguageMatchingSchema = z.enum(LANGUAGE_MATCHING);
export type LanguageMatching = z.infer<typeof LanguageMatchingSchema>;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HhmmSchema = z.string().regex(HHMM, "Expected 24h HH:MM");

// ------------------------------------------------------------------------ 2. Live endpoints
export const ENDPOINTS = {
  health: "/health",
  registerProfile: "/api/commuter/register-profile",
  addSchedule: (userId: string) => `/api/commuter/users/${encodeURIComponent(userId)}/schedule`,
  findMatches: "/api/commuter/find-matches",
  respond: (matchId: string) => `/api/commuter/matches/${encodeURIComponent(matchId)}/respond`,
  myMatches: (userId: string) => `/api/commuter/users/${encodeURIComponent(userId)}/matches`,
  messages: (matchId: string) => `/api/commuter/matches/${encodeURIComponent(matchId)}/messages`,
  confirmJourney: "/api/commuter/journeys/confirm",
  trust: (userId: string) => `/api/commuter/users/${encodeURIComponent(userId)}/trust`,
  languages: (userId: string) => `/api/commuter/users/${encodeURIComponent(userId)}/languages`,
  supportedLanguages: "/api/commuter/languages",
  // PROPOSED, not yet in backend:
  report: (matchId: string) => `/api/commuter/matches/${encodeURIComponent(matchId)}/report`,
  block: "/api/commuter/block",
  user: (userId: string) => `/api/commuter/users/${encodeURIComponent(userId)}`,
} as const;

// GET /health
export const HealthResponseSchema = z.object({
  status: z.string(),
  database: z.boolean(),
  llm_mode: z.string(),
  vector_backend: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// Languages (shared by registration, matches and the languages endpoints)
export const LanguageInSchema = z
  .object({ code: z.string().min(2).max(3), proficiency: LanguageProficiencySchema })
  .strict();
export type LanguageIn = z.infer<typeof LanguageInSchema>;

export const LanguageSchema = z.object({ code: z.string(), name: z.string() });
export type Language = z.infer<typeof LanguageSchema>;

export const UserLanguageSchema = LanguageSchema.extend({ proficiency: LanguageProficiencySchema });
export type UserLanguage = z.infer<typeof UserLanguageSchema>;

// POST /api/commuter/register-profile
// The backend uses `extra="forbid"`: unknown keys are rejected with 422, so requests are .strict().
export const RegisterProfileRequestSchema = z
  .object({
    anonymous_display_name: z.string().min(3).max(40).optional(),
    uni_affiliation: z.string().trim().min(2).max(80),
    /** The station nearest campus (must be a known station name). */
    university_hub: z.string().min(2).max(60),
    home_station: z.string().min(2).max(60),
    gender_identity: GenderIdentitySchema.optional(),
    gender_preference: GenderPreferenceSchema.optional(),
    safety_preferences: z.array(SafetyTagSchema).optional(),
    study_interests: z.array(z.string().min(1).max(40)).max(8).optional(),
    bio_freetext: z.string().max(600).optional(),
    commute_description: z.string().min(5).max(1200),
    /** Only revealed to match members after every member accepts. */
    contact_handle: z.string().max(120).optional(),
    languages: z.array(LanguageInSchema).max(12).optional(),
    language_matching: LanguageMatchingSchema.optional(),
    share_languages: z.boolean().optional(),
  })
  .strict();
export type RegisterProfileRequest = z.infer<typeof RegisterProfileRequestSchema>;

// POST /api/commuter/users/{user_id}/schedule (answer a clarification or add another commute)
export const AddScheduleRequestSchema = z.object({ commute_description: z.string().min(5).max(1200) }).strict();
export type AddScheduleRequest = z.infer<typeof AddScheduleRequestSchema>;

export const ParsedScheduleSchema = z.object({
  origin_station: z.string(),
  destination_station: z.string(),
  line: z.string(),
  days: z.array(DayOfWeekSchema),
  window_start: HhmmSchema,
  window_end: HhmmSchema,
  study_interests: z.array(z.string()),
  // Tolerant: a new backend tag should not break the UI; unknown tags render with a generic label.
  safety_preferences: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type ParsedSchedule = z.infer<typeof ParsedScheduleSchema>;

export const RegisterProfileResponseSchema = z.object({
  user_id: z.string().uuid(),
  anonymous_display_name: z.string().min(1),
  status: z.enum(["registered", "needs_clarification"]),
  parsed_schedule: ParsedScheduleSchema.nullish(),
  clarification_question: z.string().nullish(),
  /** "rule_based" when the backend has no Anthropic key; otherwise a Claude mode label. */
  mode: z.string(),
  /** Languages found in the commute text. NOT saved until the student confirms them (PATCH languages). */
  detected_languages: z.array(UserLanguageSchema).default([]),
});
export type RegisterProfileResponse = z.infer<typeof RegisterProfileResponseSchema>;

// POST /api/commuter/find-matches
export const FindMatchesRequestSchema = z
  .object({ user_id: z.string().uuid(), day_of_week: DayOfWeekSchema.optional() })
  .strict();
export type FindMatchesRequest = z.infer<typeof FindMatchesRequestSchema>;

export const AssemblyInstructionsSchema = z.object({
  carriage_position: z.string(),
  landmark: z.string(),
  meet_time: HhmmSchema,
  last_mile_handoff: z.string(),
});
export type AssemblyInstructions = z.infer<typeof AssemblyInstructionsSchema>;

/** Public trust signal: a count and a tier. Never journey dates, partners or routes. */
export const ParticipantTrustSchema = z.object({
  display_name: z.string(),
  journeys_completed: z.number().int().min(0),
  tier_label: z.string(),
});
export type ParticipantTrust = z.infer<typeof ParticipantTrustSchema>;

export const ParticipantLanguagesSchema = z.object({ display_name: z.string(), languages: z.array(UserLanguageSchema) });
export type ParticipantLanguages = z.infer<typeof ParticipantLanguagesSchema>;

export const MatchSchema = z.object({
  match_id: z.string().uuid(),
  match_type: MatchTypeSchema,
  /** Anonymous display names. The first entry is the requester. */
  display_names: z.array(z.string()).min(1),
  /** May name more than one line, e.g. "Victoria / Piccadilly". */
  shared_line: z.string(),
  meet_station: z.string(),
  assembly_instructions: AssemblyInstructionsSchema,
  icebreaker: z.string(),
  safety_notes: z.array(z.string()),
  similarity_reasons: z.array(z.string()),
  /** One entry per other participant, in display_names order. */
  participants_trust: z.array(ParticipantTrustSchema).default([]),
  /** Only languages every participant speaks and agreed to show. Never anyone's full list before mutual accept. */
  shared_languages: z.array(LanguageSchema).default([]),
  /** Full lists: only after mutual accept, and only for people who chose to show them. */
  participant_languages: z.array(ParticipantLanguagesSchema).nullish(),
});
export type Match = z.infer<typeof MatchSchema>;
/** What a fixture or caller may omit (the schema fills the defaults). */
export type MatchInput = z.input<typeof MatchSchema>;

export const FindMatchesResponseSchema = z.object({
  matches: z.array(MatchSchema),
  notes: z.array(z.string()).default([]),
  day_of_week: DayOfWeekSchema.nullish(),
  mode: z.string(),
});
export type FindMatchesResponse = z.infer<typeof FindMatchesResponseSchema>;

// POST /api/commuter/matches/{match_id}/respond
// Re-sending "accept" is idempotent and returns the current state, which is how the UI checks again.
export const RespondRequestSchema = z
  .object({ user_id: z.string().uuid(), response: z.enum(["accept", "decline"]) })
  .strict();
export type RespondRequest = z.infer<typeof RespondRequestSchema>;

export const MemberStatusSchema = z.object({
  display_name: z.string(),
  response: z.enum(["pending", "accepted", "declined"]),
});
export type MemberStatus = z.infer<typeof MemberStatusSchema>;

export const UnlockedContactSchema = z.object({ display_name: z.string(), contact_handle: z.string() });
export type UnlockedContact = z.infer<typeof UnlockedContactSchema>;

export const RespondResponseSchema = z.object({
  match_id: z.string().uuid(),
  /** "confirmed" means every member accepted (mutual accept). */
  status: z.enum(["pending", "confirmed", "declined"]),
  members: z.array(MemberStatusSchema),
  /** Present only once the match is confirmed and the caller accepted. */
  contacts: z.array(UnlockedContactSchema).nullish(),
  /** Like contacts: unlocked by mutual accept, only for people who chose to show their languages. */
  participant_languages: z.array(ParticipantLanguagesSchema).nullish(),
});
export type RespondResponse = z.infer<typeof RespondResponseSchema>;

// Error bodies: {"error": "...", "detail"?: "...", "details"?: [{loc, msg}]}
export const ApiErrorBodySchema = z.object({
  error: z.union([z.string(), z.array(z.unknown()), z.record(z.unknown())]).optional(),
  detail: z.string().optional(),
  details: z.array(z.object({ loc: z.array(z.string()).optional(), msg: z.string().optional() })).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

// ------------------------------------------------------ 2b. My matches + in-app chat
// GET /api/commuter/users/{user_id}/matches: every match the user belongs to, newest first.
export const MyMatchSchema = MatchSchema.extend({
  status: z.enum(["pending", "confirmed", "declined"]),
  my_response: z.enum(["pending", "accepted", "declined"]),
  members: z.array(MemberStatusSchema),
  /** False when someone else's search produced this match (an invitation). */
  you_requested: z.boolean(),
  created_at: z.string(),
});
export type MyMatch = z.infer<typeof MyMatchSchema>;

export const MyMatchesResponseSchema = z.object({ matches: z.array(MyMatchSchema) });
export type MyMatchesResponse = z.infer<typeof MyMatchesResponseSchema>;

// GET/POST /api/commuter/matches/{match_id}/messages. Chat opens only once a match is confirmed (409 before).
export const ChatMessageSchema = z.object({
  message_id: z.string().uuid(),
  match_id: z.string().uuid(),
  sender_display_name: z.string(),
  mine: z.boolean(),
  /** Stored after server-side redaction of addresses, postcodes, emails and phone numbers. */
  body: z.string(),
  sent_at: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const MessagesResponseSchema = z.object({
  match_id: z.string().uuid(),
  status: z.string(),
  messages: z.array(ChatMessageSchema),
});
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;

export const SendMessageRequestSchema = z
  .object({ user_id: z.string().uuid(), body: z.string().trim().min(1).max(1000) })
  .strict();
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

// ----------------------------------------- 2c. Trust badges + journeys, languages (live)
// POST /api/commuter/journeys/confirm: "We travelled together". Counts only when 2+ participants confirm
// the same day. Re-sending is idempotent and returns the current state, which is how the UI checks again.
export const JourneyConfirmRequestSchema = z
  .object({
    user_id: z.string().uuid(),
    match_id: z.string().uuid(),
    /** YYYY-MM-DD; defaults to today (Europe/London). Never in the future or older than 24 hours. */
    journey_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
export type JourneyConfirmRequest = z.infer<typeof JourneyConfirmRequestSchema>;

export const JourneyConfirmResponseSchema = z.object({
  status: z.enum(["waiting_for_partner", "completed"]),
  journeys_completed: z.number().int().min(0),
  tier_label: z.string(),
});
export type JourneyConfirmResponse = z.infer<typeof JourneyConfirmResponseSchema>;

// GET /api/commuter/users/{user_id}/trust (auth not implemented in the backend yet)
export const TrustSummarySchema = z.object({
  journeys_completed: z.number().int().min(0),
  tier: z.string(),
  tier_label: z.string(),
  /** Journeys needed to reach the next tier; null at the top tier. */
  next_tier_at: z.number().int().nullable(),
});
export type TrustSummary = z.infer<typeof TrustSummarySchema>;

// PATCH /api/commuter/users/{user_id}/languages. Omitted fields stay as they are; `languages` replaces the list.
export const UpdateLanguagesRequestSchema = z
  .object({
    languages: z.array(LanguageInSchema).max(12).optional(),
    language_matching: LanguageMatchingSchema.optional(),
    share_languages: z.boolean().optional(),
  })
  .strict();
export type UpdateLanguagesRequest = z.infer<typeof UpdateLanguagesRequestSchema>;

export const LanguageSettingsSchema = z.object({
  languages: z.array(UserLanguageSchema),
  language_matching: LanguageMatchingSchema,
  share_languages: z.boolean(),
});
export type LanguageSettings = z.infer<typeof LanguageSettingsSchema>;

// GET /api/commuter/languages
export const SupportedLanguagesResponseSchema = z.object({ languages: z.array(LanguageSchema).min(1) });
export type SupportedLanguagesResponse = z.infer<typeof SupportedLanguagesResponseSchema>;

// ------------------------------------------- 3. PROPOSED endpoints (not yet in backend)
export const REPORT_REASONS = [
  "made_me_uncomfortable",
  "no_show_or_unreliable",
  "inappropriate_messages",
  "shared_personal_info",
  "safety_concern",
  "other",
] as const;
export const ReportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

/** PROPOSED, not yet in backend: POST /api/commuter/matches/{id}/report */
export const ReportRequestSchema = z
  .object({ user_id: z.string().uuid(), reason: ReportReasonSchema, details: z.string().max(1000).optional() })
  .strict();
export type ReportRequest = z.infer<typeof ReportRequestSchema>;
export const ReportResponseSchema = z.object({ report_id: z.string(), status: z.literal("received") });
export type ReportResponse = z.infer<typeof ReportResponseSchema>;

/** PROPOSED, not yet in backend: POST /api/commuter/block */
export const BlockRequestSchema = z
  .object({ user_id: z.string().uuid(), blocked_display_name: z.string().min(1).max(60) })
  .strict();
export type BlockRequest = z.infer<typeof BlockRequestSchema>;
export const BlockResponseSchema = z.object({ status: z.literal("blocked"), blocked_display_name: z.string() });
export type BlockResponse = z.infer<typeof BlockResponseSchema>;

/** PROPOSED, not yet in backend: PATCH /api/commuter/users/{id} */
export const UpdateProfileRequestSchema = z
  .object({
    is_active: z.boolean().optional(),
    gender_preference: GenderPreferenceSchema.optional(),
    safety_preferences: z.array(SafetyTagSchema).optional(),
    study_interests: z.array(z.string().min(1).max(40)).max(8).optional(),
  })
  .strict();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
export const UpdateProfileResponseSchema = z.object({ status: z.literal("updated"), is_active: z.boolean() });
export type UpdateProfileResponse = z.infer<typeof UpdateProfileResponseSchema>;

/** PROPOSED, not yet in backend: DELETE /api/commuter/users/{id} */
export const DeleteUserResponseSchema = z.object({ status: z.literal("deleted") });
export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;

/**
 * Result of a proposed endpoint. `delivered: "this_device"` means the backend does not have the
 * endpoint yet, so the action was only recorded in this browser. The UI must say so honestly.
 */
export interface Proposed<T> {
  data: T;
  delivered: "server" | "this_device";
}

// ------------------------------------------------------------------ 4. Client interface
export interface GhostApi {
  readonly kind: "mock" | "http";
  health(): Promise<HealthResponse>;
  registerProfile(body: RegisterProfileRequest): Promise<RegisterProfileResponse>;
  addSchedule(userId: string, body: AddScheduleRequest): Promise<RegisterProfileResponse>;
  findMatches(body: FindMatchesRequest): Promise<FindMatchesResponse>;
  respond(matchId: string, body: RespondRequest): Promise<RespondResponse>;
  listMyMatches(userId: string): Promise<MyMatchesResponse>;
  /** `after` (an ISO timestamp from the last message) returns only newer messages, for polling. */
  listMessages(matchId: string, userId: string, after?: string): Promise<MessagesResponse>;
  sendMessage(matchId: string, body: SendMessageRequest): Promise<ChatMessage>;
  confirmJourney(body: JourneyConfirmRequest): Promise<JourneyConfirmResponse>;
  getTrust(userId: string): Promise<TrustSummary>;
  updateLanguages(userId: string, body: UpdateLanguagesRequest): Promise<LanguageSettings>;
  listLanguages(): Promise<SupportedLanguagesResponse>;
  reportMatch(matchId: string, body: ReportRequest): Promise<Proposed<ReportResponse>>;
  blockUser(body: BlockRequest): Promise<Proposed<BlockResponse>>;
  updateProfile(userId: string, body: UpdateProfileRequest): Promise<Proposed<UpdateProfileResponse>>;
  deleteUser(userId: string): Promise<Proposed<DeleteUserResponse>>;
}
