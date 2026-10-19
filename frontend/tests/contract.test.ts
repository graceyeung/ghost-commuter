import { describe, expect, it, vi } from "vitest";
import {
  FindMatchesResponseSchema,
  JourneyConfirmRequestSchema,
  JourneyConfirmResponseSchema,
  RegisterProfileRequestSchema,
  RegisterProfileResponseSchema,
  RespondResponseSchema,
  TrustSummarySchema,
  UpdateLanguagesRequestSchema,
} from "@/lib/api/contract";
import { createHttpClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

// Captured from the running FastAPI backend (rule-based mode, seeded demo data).
const REAL_FIND_MATCHES = {
  matches: [
    {
      match_id: "d773df39-2db5-4f97-8b40-7e9c8642d47b",
      match_type: "walk_home_pair",
      display_names: ["Lunar Hare", "Mossy Otter"],
      shared_line: "Victoria / Piccadilly",
      meet_station: "Finsbury Park",
      assembly_instructions: {
        carriage_position: "middle carriages (cars 3-4)",
        landmark: "the Wells Terrace exit ticket hall under the departure boards",
        meet_time: "22:45",
        last_mile_handoff: "Ride together to Finsbury Park, leave by the main staffed exit and walk together along the busiest, best-lit main road.",
      },
      icebreaker: "Hi Mossy Otter! We're both heading to Finsbury Park around 22:45.",
      safety_notes: ["(Mock transit data) Finsbury Park safety: staffed late, CCTV on all platforms."],
      similarity_reasons: ["Departure windows line up (meet around 22:45)", "Shared study interest: urban planning"],
    },
  ],
  notes: [],
  day_of_week: "thu",
  mode: "rule_based",
};

describe("contract schemas", () => {
  it("parses a real find-matches response", () => {
    const parsed = FindMatchesResponseSchema.parse(REAL_FIND_MATCHES);
    expect(parsed.matches[0]?.assembly_instructions.meet_time).toBe("22:45");
    expect(parsed.day_of_week).toBe("thu");
  });

  it("rejects a match with a malformed meet time", () => {
    const bad = structuredClone(REAL_FIND_MATCHES);
    bad.matches[0]!.assembly_instructions.meet_time = "10:45pm";
    expect(FindMatchesResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("parses registration responses with and without a parsed schedule", () => {
    expect(
      RegisterProfileResponseSchema.parse({
        user_id: "6b1c022f-61a5-48fe-98e3-5d00a209cc1d",
        anonymous_display_name: "Velvet Owl",
        status: "needs_clarification",
        parsed_schedule: null,
        clarification_question: "Roughly what time do you leave?",
        mode: "rule_based",
      }).status,
    ).toBe("needs_clarification");

    expect(
      RegisterProfileResponseSchema.safeParse({
        user_id: "not-a-uuid",
        anonymous_display_name: "Velvet Owl",
        status: "registered",
        mode: "rule_based",
      }).success,
    ).toBe(false);
  });

  it("parses respond responses including unlocked contacts", () => {
    const parsed = RespondResponseSchema.parse({
      match_id: "d773df39-2db5-4f97-8b40-7e9c8642d47b",
      status: "confirmed",
      members: [
        { display_name: "Lunar Hare", response: "accepted" },
        { display_name: "Mossy Otter", response: "accepted" },
      ],
      contacts: [{ display_name: "Mossy Otter", contact_handle: "@mossy.otter" }],
    });
    expect(parsed.contacts).toHaveLength(1);
  });

  it("refuses to send keys the backend would reject (extra=forbid)", () => {
    expect(
      RegisterProfileRequestSchema.safeParse({
        uni_affiliation: "UCL",
        university_hub: "Euston",
        home_station: "Finsbury Park",
        commute_description: "Thursdays 10:30pm Victoria line",
        home_zone: 2,
      }).success,
    ).toBe(false);
  });
});

describe("trust + language contract", () => {
  it("fills defaults for responses from a backend without the new fields", () => {
    const parsed = FindMatchesResponseSchema.parse(REAL_FIND_MATCHES);
    expect(parsed.matches[0]?.participants_trust).toEqual([]);
    expect(parsed.matches[0]?.shared_languages).toEqual([]);
  });

  it("parses the extended find-matches response", () => {
    const extended = structuredClone(REAL_FIND_MATCHES) as Record<string, unknown> & { matches: Record<string, unknown>[] };
    extended.matches[0] = {
      ...extended.matches[0],
      participants_trust: [{ display_name: "Mossy Otter", journeys_completed: 12, tier_label: "Trusted" }],
      shared_languages: [{ code: "bn", name: "Bengali" }],
      participant_languages: null,
    };
    const parsed = FindMatchesResponseSchema.parse(extended);
    expect(parsed.matches[0]?.participants_trust[0]?.tier_label).toBe("Trusted");
    expect(parsed.matches[0]?.shared_languages[0]?.name).toBe("Bengali");
  });

  it("validates journey, trust and language payloads", () => {
    expect(JourneyConfirmResponseSchema.safeParse({ status: "waiting_for_partner", journeys_completed: 0, tier_label: "New" }).success).toBe(true);
    expect(JourneyConfirmResponseSchema.safeParse({ status: "done", journeys_completed: 0, tier_label: "New" }).success).toBe(false);
    expect(TrustSummarySchema.parse({ journeys_completed: 30, tier: "commute_veteran", tier_label: "Commute veteran", next_tier_at: null }).next_tier_at).toBeNull();
    expect(JourneyConfirmRequestSchema.safeParse({ user_id: "6b1c022f-61a5-48fe-98e3-5d00a209cc1d", match_id: "d773df39-2db5-4f97-8b40-7e9c8642d47b", journey_date: "16/10/2026" }).success).toBe(false);
    expect(UpdateLanguagesRequestSchema.safeParse({ languages: [{ code: "bn", proficiency: "native" }], extra: 1 }).success).toBe(false);
  });

  it("sends PATCH for languages and GET for trust", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ languages: [], language_matching: "off", share_languages: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ journeys_completed: 0, tier: "new", tier_label: "New", next_tier_at: 1 }), { status: 200 }));
    const api = createHttpClient({ baseUrl: "http://api.test", fetchImpl });
    await api.updateLanguages("6b1c022f-61a5-48fe-98e3-5d00a209cc1d", { language_matching: "off" });
    expect(fetchImpl).toHaveBeenLastCalledWith("http://api.test/api/commuter/users/6b1c022f-61a5-48fe-98e3-5d00a209cc1d/languages", expect.objectContaining({ method: "PATCH" }));
    expect((await api.getTrust("6b1c022f-61a5-48fe-98e3-5d00a209cc1d")).tier_label).toBe("New");
  });
});

describe("HTTP client", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("returns validated data for a good response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(REAL_FIND_MATCHES));
    const api = createHttpClient({ baseUrl: "http://api.test", fetchImpl });
    const result = await api.findMatches({ user_id: "6b1c022f-61a5-48fe-98e3-5d00a209cc1d", day_of_week: "thu" });
    expect(result.matches).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith("http://api.test/api/commuter/find-matches", expect.objectContaining({ method: "POST" }));
  });

  it("turns an invalid response into a friendly contract error instead of crashing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ matches: "oops" }));
    const api = createHttpClient({ baseUrl: "http://api.test", fetchImpl });
    const error = await api.findMatches({ user_id: "6b1c022f-61a5-48fe-98e3-5d00a209cc1d" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("contract");
    expect((error as ApiError).message).toMatch(/unexpected reply/i);
    warn.mockRestore();
  });

  it("maps backend errors to calm messages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "home_station must be a known station name" }, 422));
    const api = createHttpClient({ baseUrl: "http://api.test", fetchImpl });
    const error = (await api
      .registerProfile({ uni_affiliation: "UCL", university_hub: "Euston", home_station: "Nowhere", commute_description: "Thursdays 10:30pm" })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(422);
    expect(error.message).toBe("Home station must be a known station name.");
  });

  it("falls back to this device when a proposed endpoint is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "Not Found" }, 404));
    const api = createHttpClient({ baseUrl: "http://api.test", fetchImpl });
    const result = await api.blockUser({ user_id: "6b1c022f-61a5-48fe-98e3-5d00a209cc1d", blocked_display_name: "Mossy Otter" });
    expect(result.delivered).toBe("this_device");
    expect(result.data.status).toBe("blocked");
  });
});
