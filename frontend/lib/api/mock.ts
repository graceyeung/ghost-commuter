/**
 * Mock GhostApi for offline demos. Same interface as the HTTP client, realistic fixtures,
 * 600-1200 ms latency, and state kept in localStorage so a page refresh doesn't lose the demo.
 *
 * Scripted cases:
 *   - Clarification: commute text containing "sometime" with no explicit time.
 *   - Empty results: searching for Sunday ("sun").
 *   - Pair + group: every other search. Personalised to the parsed line/stations/time/interest.
 *   - Mutual accept: after you accept, the other member(s) accept ~2.5 s later
 *     (the UI checks again automatically, or with "Check again").
 *   - Chat: once confirmed, a buddy says hello; every message you send gets a friendly reply
 *     2-4 s later. Messages are redacted like the backend does.
 *   - Journeys: after mutual accept, "We travelled together" first returns waiting_for_partner; the
 *     others confirm ~3 s later, so the next check returns completed and every badge goes up once.
 *   - Trust fixtures: companions span New (Tidal Stoat, Silent Moth), First steps (Misty Kestrel),
 *     Regular (Cobalt Heron, Pebble Vole), Trusted (Mossy Otter) and Commute veteran (Quiet Curlew).
 *   - Languages: the pair partner is someone who shares one of your non-English languages if anyone
 *     does (shared-language case); list none for the no-shared case. Before mutual accept only shared
 *     languages are returned; Silent Moth keeps theirs hidden. "Only match me with a shared language"
 *     plus languages nobody here speaks (e.g. only Welsh) returns the require_shared empty result.
 */
import {
  AddScheduleRequestSchema,
  BlockRequestSchema,
  DAYS,
  FindMatchesRequestSchema,
  JourneyConfirmRequestSchema,
  RegisterProfileRequestSchema,
  ReportRequestSchema,
  RespondRequestSchema,
  SendMessageRequestSchema,
  UpdateLanguagesRequestSchema,
  UpdateProfileRequestSchema,
  type ChatMessage,
  type DayOfWeek,
  type FindMatchesResponse,
  type GhostApi,
  type Language,
  type LanguageIn,
  type LanguageMatching,
  type LanguageProficiency,
  type LanguageSettings,
  type Match,
  type MemberStatus,
  type MyMatch,
  type ParsedSchedule,
  type ParticipantLanguages,
  type ParticipantTrust,
  type RegisterProfileResponse,
  type RespondResponse,
  type UserLanguage,
} from "./contract";
import { ApiError } from "./errors";
import { findStation, LINE_NAMES, sharedLines, STATIONS, type LineName } from "../stations";
import { SUPPORTED_LANGUAGES, languageName } from "../languages";
import { trustSummary } from "../trust";
import { redactPii } from "../pii";
import { randomId, readJson, writeJson } from "../storage";

const DB_KEY = "ghost-commuter:mock-db";
const OTHERS_ACCEPT_AFTER_MS = 2500;
const PARTNER_CONFIRMS_AFTER_MS = 3000;

interface MockUser {
  displayName: string;
  universityHub: string;
  homeStation: string;
  studyInterests: string[];
  safetyPreferences: string[];
  parsed: ParsedSchedule | null;
  isActive: boolean;
  blocked: string[];
  languages: LanguageIn[];
  languageMatching: LanguageMatching;
  shareLanguages: boolean;
  journeysCompleted: number;
}

interface MockJourney {
  /** When you first said "we travelled together" for this match on this day. */
  firstConfirmedAt: number;
  /** Set once everyone has been credited, so counts rise exactly once per match per day. */
  credited: boolean;
}

interface MockMatchState {
  matchId: string;
  userId: string;
  others: string[];
  myResponse: "pending" | "accepted" | "declined";
  acceptedAt?: number;
  match?: Match;
  createdAt?: number;
}

interface MockMessage {
  id: string;
  sender: string;
  body: string;
  /** May be in the future: buddy replies are written immediately and "arrive" at sentAt. */
  sentAt: number;
}

interface MockDb {
  users: Record<string, MockUser>;
  matches: Record<string, MockMatchState>;
  messages: Record<string, MockMessage[]>;
  /** Keyed `${matchId}|${YYYY-MM-DD}`. Never returned by any endpoint (journey history is private). */
  journeys: Record<string, MockJourney>;
  /** Companions' journey counts, which rise when a shared journey completes. */
  companionJourneys: Record<string, number>;
}

const ADJECTIVES = ["Velvet", "Cobalt", "Lunar", "Copper", "Misty", "Tidal", "Hushed", "Polar", "Dusky", "Starlit", "Foggy", "Gentle"];
const ANIMALS = ["Owl", "Heron", "Badger", "Lynx", "Hare", "Otter", "Kestrel", "Fox", "Stoat", "Puffin", "Marten", "Curlew"];
const COMPANIONS = ["Mossy Otter", "Cobalt Heron", "Tidal Stoat", "Misty Kestrel", "Quiet Curlew", "Pebble Vole", "Silent Moth"];

interface CompanionProfile {
  journeys: number;
  languages: { code: string; proficiency: LanguageProficiency }[];
  shareLanguages: boolean;
}

/** Fixed demo companions: trust from New to Commute veteran, and varied languages. */
const COMPANION_PROFILES: Record<string, CompanionProfile> = {
  "Mossy Otter": { journeys: 12, shareLanguages: true, languages: [{ code: "en", proficiency: "native" }, { code: "bn", proficiency: "native" }, { code: "syl", proficiency: "conversational" }] },
  "Cobalt Heron": { journeys: 6, shareLanguages: true, languages: [{ code: "en", proficiency: "fluent" }, { code: "es", proficiency: "native" }] },
  "Tidal Stoat": { journeys: 0, shareLanguages: true, languages: [{ code: "en", proficiency: "native" }, { code: "pl", proficiency: "native" }] },
  "Misty Kestrel": { journeys: 2, shareLanguages: true, languages: [{ code: "en", proficiency: "native" }, { code: "ur", proficiency: "fluent" }, { code: "pa", proficiency: "conversational" }] },
  "Quiet Curlew": { journeys: 31, shareLanguages: true, languages: [{ code: "en", proficiency: "fluent" }, { code: "zh", proficiency: "native" }, { code: "yue", proficiency: "fluent" }] },
  "Pebble Vole": { journeys: 7, shareLanguages: true, languages: [{ code: "en", proficiency: "native" }, { code: "fr", proficiency: "conversational" }] },
  "Silent Moth": { journeys: 0, shareLanguages: false, languages: [{ code: "en", proficiency: "native" }, { code: "bn", proficiency: "fluent" }] },
};

const GREETINGS: Record<string, string> = { bn: "Kemon acho?", es: "¡Hola!", pl: "Cześć!", ur: "Kya haal hai?", pa: "Ki haal aa?", zh: "Nǐ hǎo!", yue: "Néih hóu!", fr: "Salut !" };

export interface MockClientOptions {
  /** Override latency (tests pass 0). */
  latency?: () => number;
  now?: () => number;
}

export function createMockClient(options: MockClientOptions = {}): GhostApi {
  const latency = options.latency ?? (() => 600 + Math.floor(Math.random() * 600));
  const now = options.now ?? (() => Date.now());
  let memoryDb: MockDb | null = null;

  const load = (): MockDb => {
    if (memoryDb) return memoryDb;
    const stored = readJson<Partial<MockDb>>(DB_KEY, {});
    const users = Object.fromEntries(Object.entries(stored.users ?? {}).map(([id, u]) => [id, withLanguageDefaults(u)]));
    memoryDb = {
      users,
      matches: stored.matches ?? {},
      messages: stored.messages ?? {},
      journeys: stored.journeys ?? {},
      companionJourneys: stored.companionJourneys ?? {},
    };
    return memoryDb;
  };
  const save = (db: MockDb) => {
    memoryDb = db;
    writeJson(DB_KEY, db);
  };
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latency()));

  const requireUser = (db: MockDb, userId: string): MockUser => {
    const user = db.users[userId];
    if (!user || !user.isActive) throw new ApiError("http", "We couldn't find that. If you cleared your data, please join again.", { status: 404, serverCode: "user not found" });
    return user;
  };

  const registration = (userId: string, user: MockUser, text: string): RegisterProfileResponse => {
    const result = parseCommute(text, user.universityHub, user.homeStation, user.studyInterests, user.safetyPreferences);
    // Languages stated in the text are shown back for confirmation, never saved here.
    const saved = new Set(user.languages.map((l) => l.code));
    const detected_languages = detectLanguages(text).filter((l) => !saved.has(l.code));
    if (result.clarification) {
      return { user_id: userId, anonymous_display_name: user.displayName, status: "needs_clarification", parsed_schedule: null, clarification_question: result.clarification, mode: "mock", detected_languages };
    }
    user.parsed = result.parsed;
    user.studyInterests = Array.from(new Set([...user.studyInterests, ...result.parsed.study_interests])).slice(0, 8);
    return { user_id: userId, anonymous_display_name: user.displayName, status: "registered", parsed_schedule: result.parsed, clarification_question: null, mode: "mock", detected_languages };
  };

  const companionTrust = (db: MockDb, name: string): number => db.companionJourneys[name] ?? COMPANION_PROFILES[name]?.journeys ?? 0;

  /** Trust for every other participant plus the language disclosures this viewer may see. */
  const disclosed = (db: MockDb, user: MockUser, others: string[], confirmed: boolean) => {
    const participants_trust: ParticipantTrust[] = others.map((name) => {
      const count = companionTrust(db, name);
      return { display_name: name, journeys_completed: count, tier_label: trustSummary(count).tier_label };
    });
    const profiles = [userProfile(user), ...others.map(companionProfile)];
    const shared_languages = sharedLanguages(profiles);
    const participant_languages: ParticipantLanguages[] | null = confirmed
      ? others
          .filter((name) => COMPANION_PROFILES[name]?.shareLanguages)
          .map((name) => ({ display_name: name, languages: (COMPANION_PROFILES[name]?.languages ?? []).map(toUserLanguage) }))
      : null;
    return { participants_trust, shared_languages, participant_languages };
  };

  return {
    kind: "mock",

    async health() {
      await wait();
      return { status: "ok", database: true, llm_mode: "mock", vector_backend: "mock" };
    },

    async registerProfile(body) {
      const req = RegisterProfileRequestSchema.parse(body);
      await wait();
      const hub = findStation(req.university_hub);
      const home = findStation(req.home_station);
      if (!hub) throw new ApiError("http", "University hub must be a known station name.", { status: 422 });
      if (!home) throw new ApiError("http", "Home station must be a known station name.", { status: 422 });
      const db = load();
      const userId = randomId();
      const user: MockUser = {
        displayName: req.anonymous_display_name ?? uniqueName(db),
        universityHub: hub.name,
        homeStation: home.name,
        studyInterests: (req.study_interests ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 8),
        safetyPreferences: req.safety_preferences ?? [],
        parsed: null,
        isActive: true,
        blocked: [],
        languages: dedupeLanguages(req.languages ?? []),
        languageMatching: req.language_matching ?? "prefer_shared",
        shareLanguages: req.share_languages ?? true,
        journeysCompleted: 0,
      };
      db.users[userId] = user;
      const response = registration(userId, user, req.commute_description);
      save(db);
      return response;
    },

    async addSchedule(userId, body) {
      const req = AddScheduleRequestSchema.parse(body);
      await wait();
      const db = load();
      const user = requireUser(db, userId);
      const response = registration(userId, user, req.commute_description);
      save(db);
      return response;
    },

    async findMatches(body) {
      const req = FindMatchesRequestSchema.parse(body);
      await wait();
      await wait(); // matching narrates three steps; give it a little longer
      const db = load();
      const user = requireUser(db, req.user_id);
      const day = req.day_of_week ?? null;
      if (day === "sun") {
        return {
          matches: [],
          notes: [
            "Nobody else on your line has a Sunday-night commute in your departure window yet.",
            "Sunday is quiet: most students who travel late do so Thursday to Saturday.",
          ],
          day_of_week: "sun",
          mode: "mock",
        } satisfies FindMatchesResponse;
      }
      const fixtures = buildFixtures(user, day)
        .filter((m) => !m.display_names.slice(1).some((name) => user.blocked.includes(name)))
        .map((m) => ({ ...m, ...disclosed(db, user, m.display_names.slice(1), false) }))
        .map((m) => withLanguageReason(m, user));
      // require_shared: everyone you're matched with must share one of your languages (backend pre-filter).
      const me = userProfile(user);
      const matches =
        user.languageMatching === "require_shared"
          ? fixtures.filter((m) => m.display_names.slice(1).every((name) => canMatch(me, companionProfile(name))))
          : fixtures;
      if (matches.length === 0 && fixtures.length > 0) {
        return {
          matches: [],
          notes: ["Nobody travelling your way shares one of your languages yet."],
          day_of_week: day,
          mode: "mock",
        } satisfies FindMatchesResponse;
      }
      for (const match of matches) {
        db.matches[match.match_id] = {
          matchId: match.match_id,
          userId: req.user_id,
          others: match.display_names.slice(1),
          myResponse: "pending",
          match,
          createdAt: now(),
        };
      }
      save(db);
      const notes = ["Transit details are mock data for this demo, not verified TfL information."];
      if (!user.parsed) notes.unshift("We haven't fully understood your schedule yet, so these suggestions use your stations only.");
      return { matches, notes, day_of_week: day, mode: "mock" } satisfies FindMatchesResponse;
    },

    async respond(matchId, body) {
      const req = RespondRequestSchema.parse(body);
      await wait();
      const db = load();
      const state = db.matches[matchId];
      const user = db.users[req.user_id];
      if (!state || state.userId !== req.user_id || !user) {
        throw new ApiError("http", "We couldn't find that match. It may have expired; please search again.", { status: 404, serverCode: "match not found" });
      }
      if (state.myResponse !== "declined") {
        if (req.response === "decline") state.myResponse = "declined";
        else if (state.myResponse !== "accepted") {
          state.myResponse = "accepted";
          state.acceptedAt = now();
        }
      }
      save(db);
      const result = respondState(state, user, now());
      return result.status === "confirmed"
        ? { ...result, participant_languages: disclosed(db, user, state.others, true).participant_languages }
        : result;
    },

    async listMyMatches(userId) {
      await wait();
      const db = load();
      const user = db.users[userId];
      if (!user) throw new ApiError("http", "We couldn't find that. If you cleared your data, please join again.", { status: 404 });
      const matches: MyMatch[] = Object.values(db.matches)
        .filter((state): state is MockMatchState & { match: Match } => state.userId === userId && state.match !== undefined)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .map((state) => {
          const current = respondState(state, user, now());
          return {
            ...state.match,
            ...disclosed(db, user, state.others, current.status === "confirmed"),
            status: current.status,
            my_response: state.myResponse,
            members: current.members,
            you_requested: true,
            created_at: new Date(state.createdAt ?? now()).toISOString(),
          };
        });
      return { matches };
    },

    async listMessages(matchId, userId, after) {
      await wait();
      const db = load();
      const { state, user } = requireChat(db, matchId, userId, now());
      const thread = (db.messages[matchId] ??= []);
      if (thread.length === 0) {
        // The buddy breaks the ice shortly after everyone accepts.
        const first = state.others[0] ?? "Your buddy";
        thread.push({ id: randomId(), sender: first, body: greeting(state), sentAt: now() });
        save(db);
      }
      const afterMs = after ? Date.parse(after) : Number.NEGATIVE_INFINITY;
      const visible = thread.filter((m) => m.sentAt <= now() && m.sentAt > afterMs);
      return { match_id: matchId, status: "confirmed", messages: visible.map((m) => toChat(m, matchId, user.displayName)) };
    },

    async sendMessage(matchId, body) {
      const req = SendMessageRequestSchema.parse(body);
      await wait();
      const db = load();
      const { state, user } = requireChat(db, matchId, req.user_id, now());
      const text = redactPii(req.body).trim().slice(0, 1000);
      const thread = (db.messages[matchId] ??= []);
      const mine: MockMessage = { id: randomId(), sender: user.displayName, body: text, sentAt: now() };
      thread.push(mine);
      const replier = state.others[thread.length % Math.max(state.others.length, 1)] ?? state.others[0];
      if (replier) {
        thread.push({ id: randomId(), sender: replier, body: reply(state, req.body, thread.length), sentAt: now() + 2000 + Math.floor(Math.random() * 2000) });
      }
      save(db);
      return toChat(mine, matchId, user.displayName);
    },

    async confirmJourney(body) {
      const req = JourneyConfirmRequestSchema.parse(body);
      await wait();
      const db = load();
      const state = db.matches[req.match_id];
      const user = db.users[req.user_id];
      if (!state || state.userId !== req.user_id || !user) {
        throw new ApiError("http", "We couldn't find that match. It may have been removed.", { status: 404, serverCode: "match not found" });
      }
      if (respondState(state, user, now()).status !== "confirmed") {
        throw new ApiError("http", "Journeys can be confirmed once everyone in the match has accepted.", { status: 409 });
      }
      const today = isoDay(now());
      const yesterday = isoDay(now() - 24 * 60 * 60 * 1000);
      const day = req.journey_date ?? today;
      if (day > today) throw new ApiError("http", "Journey date can't be in the future.", { status: 422 });
      if (day < yesterday) throw new ApiError("http", "Journeys can only be confirmed within 24 hours.", { status: 422 });

      const key = `${req.match_id}|${day}`;
      const journey = (db.journeys[key] ??= { firstConfirmedAt: now(), credited: false });
      // Your confirmation alone never changes anyone's count: the others confirm a few seconds later.
      const partnersConfirmed = now() - journey.firstConfirmedAt >= PARTNER_CONFIRMS_AFTER_MS;
      if (partnersConfirmed && !journey.credited) {
        journey.credited = true;
        user.journeysCompleted += 1;
        for (const name of state.others) db.companionJourneys[name] = companionTrust(db, name) + 1;
      }
      save(db);
      return {
        status: journey.credited ? "completed" : "waiting_for_partner",
        journeys_completed: user.journeysCompleted,
        tier_label: trustSummary(user.journeysCompleted).tier_label,
      };
    },

    async getTrust(userId) {
      await wait();
      const db = load();
      const user = requireUser(db, userId);
      return trustSummary(user.journeysCompleted);
    },

    async updateLanguages(userId, body) {
      const req = UpdateLanguagesRequestSchema.parse(body);
      await wait();
      const db = load();
      const user = db.users[userId];
      if (!user) throw new ApiError("http", "We couldn't find that. If you cleared your data, please join again.", { status: 404 });
      for (const lang of req.languages ?? []) {
        if (!SUPPORTED_LANGUAGES.some((l) => l.code === lang.code)) {
          throw new ApiError("http", "A few details weren't accepted (languages). Please check them and try again.", { status: 422 });
        }
      }
      if (req.languages) user.languages = dedupeLanguages(req.languages);
      if (req.language_matching) user.languageMatching = req.language_matching;
      if (req.share_languages !== undefined) user.shareLanguages = req.share_languages;
      save(db);
      return languageSettings(user);
    },

    async listLanguages() {
      await wait();
      return { languages: [...SUPPORTED_LANGUAGES] };
    },

    async reportMatch(_matchId, body) {
      ReportRequestSchema.parse(body);
      await wait();
      return { data: { report_id: randomId(), status: "received" }, delivered: "server" };
    },

    async blockUser(body) {
      const req = BlockRequestSchema.parse(body);
      await wait();
      const db = load();
      const user = db.users[req.user_id];
      if (user && !user.blocked.includes(req.blocked_display_name)) user.blocked.push(req.blocked_display_name);
      save(db);
      return { data: { status: "blocked", blocked_display_name: req.blocked_display_name }, delivered: "server" };
    },

    async updateProfile(userId, body) {
      const req = UpdateProfileRequestSchema.parse(body);
      await wait();
      const db = load();
      const user = db.users[userId];
      if (!user) throw new ApiError("http", "We couldn't find that. If you cleared your data, please join again.", { status: 404 });
      if (req.is_active !== undefined) user.isActive = req.is_active;
      if (req.safety_preferences) user.safetyPreferences = req.safety_preferences;
      if (req.study_interests) user.studyInterests = req.study_interests;
      save(db);
      return { data: { status: "updated", is_active: user.isActive }, delivered: "server" };
    },

    async deleteUser(userId) {
      await wait();
      const db = load();
      delete db.users[userId];
      for (const [id, state] of Object.entries(db.matches)) if (state.userId === userId) delete db.matches[id];
      save(db);
      return { data: { status: "deleted" }, delivered: "server" };
    },
  };
}

// ------------------------------------------------------------------------------- respond
function respondState(state: MockMatchState, user: MockUser, nowMs: number): RespondResponse {
  const othersAccepted = state.myResponse === "accepted" && state.acceptedAt !== undefined && nowMs - state.acceptedAt >= OTHERS_ACCEPT_AFTER_MS;
  const members: MemberStatus[] = [
    { display_name: user.displayName, response: state.myResponse },
    ...state.others.map((name): MemberStatus => ({ display_name: name, response: othersAccepted ? "accepted" : "pending" })),
  ];
  if (state.myResponse === "declined") return { match_id: state.matchId, status: "declined", members, contacts: null };
  if (othersAccepted) {
    return {
      match_id: state.matchId,
      status: "confirmed",
      members,
      contacts: state.others.map((name) => ({ display_name: name, contact_handle: `@${name.toLowerCase().replace(/\s+/g, ".")} on the in-app thread (demo)` })),
    };
  }
  return { match_id: state.matchId, status: "pending", members, contacts: null };
}

// ----------------------------------------------------------------------------- languages
interface LanguageProfile {
  usable: boolean;
  displayable: boolean;
  codes: Set<string>;
}

const RANK: Record<LanguageProficiency, number> = { conversational: 0, fluent: 1, native: 2 };

function withLanguageDefaults(user: MockUser): MockUser {
  return {
    ...user,
    languages: user.languages ?? [],
    languageMatching: user.languageMatching ?? "prefer_shared",
    shareLanguages: user.shareLanguages ?? true,
    journeysCompleted: user.journeysCompleted ?? 0,
  };
}

function userProfile(user: MockUser): LanguageProfile {
  const usable = user.languageMatching !== "off";
  return { usable, displayable: usable && user.shareLanguages, codes: new Set(user.languages.map((l) => l.code)) };
}

function companionProfile(name: string): LanguageProfile {
  const profile = COMPANION_PROFILES[name];
  return { usable: true, displayable: profile?.shareLanguages ?? false, codes: new Set(profile?.languages.map((l) => l.code) ?? []) };
}

/** Same rule as the backend: only languages everyone speaks AND agreed to show. */
function sharedLanguages(profiles: LanguageProfile[]): Language[] {
  if (profiles.length < 2 || !profiles.every((p) => p.displayable)) return [];
  const [first, ...rest] = profiles;
  return [...(first?.codes ?? [])]
    .filter((code) => rest.every((p) => p.codes.has(code)))
    .sort((a, b) => Number(a !== "en") - Number(b !== "en") || languageName(a).localeCompare(languageName(b)))
    .map((code) => ({ code, name: languageName(code) }));
}

function canMatch(a: LanguageProfile, b: LanguageProfile): boolean {
  return a.usable && b.usable && [...a.codes].some((code) => b.codes.has(code));
}

function toUserLanguage(lang: { code: string; proficiency: LanguageProficiency }): UserLanguage {
  return { code: lang.code, name: languageName(lang.code), proficiency: lang.proficiency };
}

function dedupeLanguages(items: LanguageIn[]): LanguageIn[] {
  const best = new Map<string, LanguageIn>();
  for (const item of items) {
    const current = best.get(item.code);
    if (!current || RANK[item.proficiency] > RANK[current.proficiency]) best.set(item.code, item);
  }
  return [...best.values()];
}

function languageSettings(user: MockUser): LanguageSettings {
  return {
    languages: [...user.languages].sort((a, b) => RANK[b.proficiency] - RANK[a.proficiency]).map(toUserLanguage),
    language_matching: user.languageMatching,
    share_languages: user.shareLanguages,
  };
}

/** Mirrors the backend's rule-based matcher: a shared-language reason, plus a greeting when you prefer one. */
function withLanguageReason(match: Match, user: MockUser): Match {
  if (match.shared_languages.length === 0) return match;
  const names = match.shared_languages.map((l) => l.name).join(", ");
  const reason = `${match.match_type === "study_group" ? "You all" : "You both"} speak ${names}`;
  const greeting = match.shared_languages.map((l) => GREETINGS[l.code]).find(Boolean);
  const icebreaker = user.languageMatching === "prefer_shared" && greeting ? `${match.icebreaker} (${greeting})` : match.icebreaker;
  return { ...match, icebreaker, similarity_reasons: [...match.similarity_reasons.slice(0, 3), reason] };
}

const SPEAK_TRIGGERS = [
  /\bi (?:also |can |can also )?speak\b/,
  /\bi(?:'m| am) (?:also )?(?:fluent|bilingual) in\b/,
  /\bmy (?:first|native|mother) (?:language|tongue)s? (?:is|are)\b/,
  /\b(?:and|,) (?:also )?speak\b/,
];

/** Strict, like the backend: only first-person statements directly followed by language names. */
export function detectLanguages(text: string): UserLanguage[] {
  const found = new Map<string, UserLanguage>();
  for (const sentence of text.toLowerCase().replace(/’/g, "'").split(/[.!?;\n]+/)) {
    for (const trigger of SPEAK_TRIGGERS) {
      const match = trigger.exec(sentence);
      if (!match) continue;
      const rest = sentence.slice(match.index + match[0].length).split(/\b(?:but|so|because|when|on the|at the|from|to|with)\b/)[0] ?? "";
      for (const chunk of rest.split(/\s*(?:,|&|\band\b|\bor\b)\s*/)) {
        const cleaned = chunk.trim().replace(/^(?:a bit of|a little|some|basic)\s+/, "");
        const conversational = cleaned !== chunk.trim();
        const lang = SUPPORTED_LANGUAGES.find((l) => cleaned === l.name.toLowerCase() || cleaned.startsWith(`${l.name.toLowerCase()} `));
        if (!lang) break;
        const native = /first|native|mother/.test(match[0]);
        if (!found.has(lang.code)) found.set(lang.code, { ...lang, proficiency: native ? "native" : conversational ? "conversational" : "fluent" });
      }
    }
  }
  return [...found.values()];
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------- chat
function requireChat(db: MockDb, matchId: string, userId: string, nowMs: number): { state: MockMatchState; user: MockUser } {
  const state = db.matches[matchId];
  const user = db.users[userId];
  if (!state || state.userId !== userId || !user) {
    throw new ApiError("http", "We couldn't find that chat. It may have been removed.", { status: 404, serverCode: "match not found" });
  }
  if (respondState(state, user, nowMs).status !== "confirmed") {
    throw new ApiError("http", "Chat opens once everyone in the match has accepted.", { status: 409 });
  }
  return { state, user };
}

function toChat(message: MockMessage, matchId: string, me: string): ChatMessage {
  return {
    message_id: message.id,
    match_id: matchId,
    sender_display_name: message.sender,
    mine: message.sender === me,
    body: message.body,
    sent_at: new Date(message.sentAt).toISOString(),
  };
}

function greeting(state: MockMatchState): string {
  const a = state.match?.assembly_instructions;
  const where = state.match ? `${state.match.meet_station}` : "the station";
  return a
    ? `Hi! Glad we matched. I'll be at ${where} by ${a.meet_time}, ${a.carriage_position}. Shout here if plans change.`
    : `Hi! Glad we matched. Shout here if plans change.`;
}

function reply(state: MockMatchState, incoming: string, turn: number): string {
  const text = incoming.toLowerCase();
  const time = state.match?.assembly_instructions.meet_time ?? "the usual time";
  if (/\[redacted\]|\b\d{1,4}\s+\w+\s+(road|street|avenue|lane)\b|@|07\d{3}/i.test(incoming)) {
    return "Let's keep it to the station for now. Happy to just walk the main road together and split at the junction.";
  }
  if (/late|delay|running/.test(text)) return "No worries, I'll wait by the help point. Text here when you're on the platform.";
  if (/home safe|got home|made it/.test(text)) return "Home safe too! Same time next week?";
  if (/\?$/.test(text.trim())) return `Good question! Let's sort it on the platform at ${time}.`;
  const lines = [
    `Sounds good. See you at ${time}!`,
    "Great. I'll be the one with a tote bag full of library books.",
    "Perfect, I'll message here when I'm on the platform.",
    "Brilliant. Let's both check in here once we're home.",
  ];
  return lines[turn % lines.length] ?? lines[0]!;
}

// ------------------------------------------------------------------------------ fixtures
function buildFixtures(user: MockUser, day: DayOfWeek | null): Match[] {
  const parsed = user.parsed;
  const home = parsed?.destination_station ?? user.homeStation;
  const origin = parsed?.origin_station ?? user.universityHub;
  const line = parsed?.line ?? sharedLines(origin, home)[0] ?? findStation(home)?.lines[0] ?? "Piccadilly";
  const meetTime = parsed?.window_start ?? "22:30";
  const interest = user.studyInterests[0] ?? parsed?.study_interests[0] ?? "statistics";
  const nightLabel = day ? dayLabel(day) : "most nights";
  const seed = hash(user.displayName + home);
  // Prefer a partner who shares one of your non-English languages, so the demo shows shared-language chips.
  const mine = userProfile(user);
  const ordered = COMPANIONS.filter((n) => n !== user.displayName).map((_, i, all) => all[(seed + i) % all.length]!);
  const partner =
    ordered.find((n) => sharedLanguages([mine, companionProfile(n)]).some((l) => l.code !== "en")) ?? pick(ordered, 0);
  const groupMembers = COMPANIONS.filter((n) => n !== user.displayName && n !== partner).slice(seed % 3, (seed % 3) + 2);
  const groupMeet = plusMinutes(meetTime, -5);
  const wellLit = user.safetyPreferences.includes("well_lit");

  const pair: Match = {
    participants_trust: [],
    shared_languages: [],
    match_id: randomId(),
    match_type: "walk_home_pair",
    display_names: [user.displayName, partner],
    shared_line: line,
    meet_station: home,
    assembly_instructions: {
      carriage_position: "middle carriages (cars 3-4)",
      landmark: `the ${line} line platform help point under the CCTV camera at ${origin}`,
      meet_time: meetTime,
      last_mile_handoff: `Ride together to ${home}, leave by the main staffed exit and walk the busiest, best-lit main road together before splitting at a lit junction; both check in on the in-app thread once home.`,
    },
    icebreaker: `Hi ${partner}! Looks like we're both heading to ${home} around ${meetTime}. What are you working on this term?`,
    safety_notes: [
      `(Mock transit data) ${home}: staffed until last train, CCTV on all platforms.`,
      "(Mock transit data) Stick to the main road out of the station; side paths are poorly lit after dark.",
    ],
    similarity_reasons: [
      `Departure windows line up (meet around ${meetTime})`,
      `You both get off at ${home}`,
      wellLit ? "Same safety priority: well-lit routes" : `You both travel ${nightLabel}`,
    ],
  };

  const group: Match = {
    participants_trust: [],
    shared_languages: [],
    match_id: randomId(),
    match_type: "study_group",
    display_names: [user.displayName, ...groupMembers],
    shared_line: line,
    meet_station: origin,
    assembly_instructions: {
      carriage_position: "front carriage (car 1)",
      landmark: `the platform end nearest the Way Out sign at ${origin}, under the help point`,
      meet_time: groupMeet,
      last_mile_handoff: `Study together from ${origin} towards ${home}; anyone alighting earlier leaves by the staffed exit and checks in on the group thread once home.`,
    },
    icebreaker: `Hi ${groupMembers.join(", ")}! ${capitalise(interest)} crew on the ${line} line: what's the toughest thing on your reading list this week?`,
    safety_notes: [`(Mock transit data) ${origin}: bright lighting throughout and staff on the gateline late.`],
    similarity_reasons: [
      `Shared study interest: ${interest}`,
      `You share the ${line} line from ${origin}`,
      `Departure windows line up (meet around ${groupMeet})`,
    ],
  };
  return [pair, group];
}

// --------------------------------------------------------------------------- mock parser
interface ParseResult {
  parsed: ParsedSchedule;
  clarification: string | null;
}

const DAY_WORDS: [RegExp, DayOfWeek[]][] = [
  [/\bweek ?nights?\b|\bweekdays?\b/i, ["mon", "tue", "wed", "thu", "fri"]],
  [/\bweekends?\b/i, ["sat", "sun"]],
  [/\bevery (?:night|day|evening)\b|\bdaily\b/i, [...DAYS]],
  [/\bmon(?:day)?s?\b/i, ["mon"]],
  [/\btue(?:s|sday)?s?\b/i, ["tue"]],
  [/\bwed(?:nesday)?s?\b/i, ["wed"]],
  [/\bthu(?:rs?|rsday)?s?\b/i, ["thu"]],
  [/\bfri(?:day)?s?\b/i, ["fri"]],
  [/\bsat(?:urday)?s?\b/i, ["sat"]],
  [/\bsun(?:day)?s?\b/i, ["sun"]],
];

const INTEREST_WORDS = ["statistics", "machine learning", "law", "medicine", "history", "philosophy", "economics", "architecture", "urban planning", "design", "chemistry", "maths", "computer science", "literature", "psychology"];

export function parseCommute(text: string, hub: string, home: string, interests: string[], safety: string[]): ParseResult {
  const found = findStationsInText(text);
  const origin = found.length >= 2 ? found[0]! : hub;
  const destination = found.length >= 1 ? found[found.length - 1]! : home;
  const named = LINE_NAMES.filter((l) => new RegExp(`\\b${l}\\b`, "i").test(text));
  const line: LineName | string = named[0] ?? sharedLines(origin, destination)[0] ?? findStation(destination)?.lines[0] ?? "Piccadilly";

  const days: DayOfWeek[] = [];
  for (const [re, ds] of DAY_WORDS) if (re.test(text)) for (const d of ds) if (!days.includes(d)) days.push(d);
  days.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));

  const time = findTime(text);
  const vague = /\bsometime\b/i.test(text);
  let confidence = 0.92;
  if (!time) confidence -= 0.25;
  if (days.length === 0) confidence -= 0.15;
  if (found.length === 0 && named.length === 0) confidence -= 0.1;

  const textInterests = INTEREST_WORDS.filter((w) => text.toLowerCase().includes(w));
  const start = time ?? "22:30";
  const parsed: ParsedSchedule = {
    origin_station: origin,
    destination_station: destination,
    line,
    days: days.length ? days : ["mon", "tue", "wed", "thu", "fri"],
    window_start: start,
    window_end: plusMinutes(start, 30),
    study_interests: Array.from(new Set([...interests.map((i) => i.toLowerCase()), ...textInterests])).slice(0, 8),
    safety_preferences: safety,
    confidence: Math.max(0.2, Math.min(0.98, confidence)),
  };
  if (vague && !time) {
    return {
      parsed: { ...parsed, confidence: 0.35 },
      clarification: "Roughly what time do you usually leave campus on those nights? A rough time like \"around 10pm\" is fine.",
    };
  }
  return { parsed, clarification: null };
}

function findStationsInText(text: string): string[] {
  const lower = text.toLowerCase().replace(/[’']/g, "");
  const hits: { index: number; name: string }[] = [];
  const candidates = [...STATIONS.map((s) => s.name), "Kings Cross", "Highbury", "Walthamstow", "Liverpool St"];
  for (const name of candidates) {
    const key = name.toLowerCase().replace(/[’']/g, "");
    const index = lower.indexOf(key);
    if (index >= 0) {
      const station = findStation(name);
      if (station && !hits.some((h) => h.name === station.name || (index >= h.index && index < h.index + h.name.length))) {
        hits.push({ index, name: station.name });
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.name);
}

function findTime(text: string): string | null {
  const m = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i.exec(text) ?? /\b(\d{1,2})[:.](\d{2})\b/.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.toLowerCase();
  if (hour > 23 || minute > 59) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  else if (suffix === "am" && hour === 12) hour = 0;
  else if (!suffix && hour >= 4 && hour < 12) hour += 12; // late-commute app: "9:15" means evening
  else if (!suffix && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// --------------------------------------------------------------------------------- utils
function plusMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = ((((h ?? 0) * 60 + (m ?? 0) + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function uniqueName(db: MockDb): string {
  const taken = new Set(Object.values(db.users).map((u) => u.displayName));
  for (let i = 0; i < 50; i++) {
    const name = `${pick(ADJECTIVES, Math.floor(Math.random() * 1e6))} ${pick(ANIMALS, Math.floor(Math.random() * 1e6))}`;
    if (!taken.has(name) && !COMPANIONS.includes(name)) return name;
  }
  return `Gentle Seal ${Math.floor(Math.random() * 90) + 10}`;
}

function pick<T>(items: readonly T[], seed: number): T {
  const item = items[Math.abs(seed) % items.length];
  if (item === undefined) throw new Error("pick from empty list");
  return item;
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function dayLabel(day: DayOfWeek): string {
  return { mon: "on Mondays", tue: "on Tuesdays", wed: "on Wednesdays", thu: "on Thursdays", fri: "on Fridays", sat: "on Saturdays", sun: "on Sundays" }[day];
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
