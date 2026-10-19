import { describe, expect, it } from "vitest";
import { createMockClient } from "@/lib/api/mock";
import {
  FindMatchesResponseSchema,
  JourneyConfirmResponseSchema,
  LanguageSettingsSchema,
  RegisterProfileResponseSchema,
  RespondResponseSchema,
  TrustSummarySchema,
} from "@/lib/api/contract";

const BASE = {
  uni_affiliation: "UCL",
  university_hub: "King's Cross St Pancras",
  home_station: "Acton Town",
  safety_preferences: ["well_lit" as const],
  study_interests: ["statistics"],
};

describe("mock client: the full offline demo flow", () => {
  it("join → find matches → accept → mutual accept", async () => {
    let now = 1_000_000;
    const api = createMockClient({ latency: () => 0, now: () => now });

    const reg = RegisterProfileResponseSchema.parse(
      await api.registerProfile({ ...BASE, commute_description: "I leave King's Cross around 9:15pm on Tuesdays and Thursdays to Acton Town via the Piccadilly line." }),
    );
    expect(reg.status).toBe("registered");
    expect(reg.parsed_schedule).toMatchObject({ origin_station: "King's Cross St Pancras", destination_station: "Acton Town", line: "Piccadilly", window_start: "21:15", window_end: "21:45", days: ["tue", "thu"] });

    const found = FindMatchesResponseSchema.parse(await api.findMatches({ user_id: reg.user_id, day_of_week: "thu" }));
    expect(found.matches.map((m) => m.match_type).sort()).toEqual(["study_group", "walk_home_pair"]);
    const pair = found.matches.find((m) => m.match_type === "walk_home_pair")!;
    expect(pair.display_names[0]).toBe(reg.anonymous_display_name);
    expect(pair.meet_station).toBe("Acton Town");

    const first = RespondResponseSchema.parse(await api.respond(pair.match_id, { user_id: reg.user_id, response: "accept" }));
    expect(first.status).toBe("pending");
    expect(first.contacts).toBeNull();

    now += 3000;
    const second = RespondResponseSchema.parse(await api.respond(pair.match_id, { user_id: reg.user_id, response: "accept" }));
    expect(second.status).toBe("confirmed");
    expect(second.contacts?.[0]?.display_name).toBe(pair.display_names[1]);
  });

  it("asks a clarification question when the text says 'sometime', then resolves it", async () => {
    const api = createMockClient({ latency: () => 0 });
    const reg = await api.registerProfile({ ...BASE, commute_description: "Sometime in the evening on Wednesdays, King's Cross to Acton Town." });
    expect(reg.status).toBe("needs_clarification");
    expect(reg.clarification_question).toMatch(/what time/i);

    const answered = await api.addSchedule(reg.user_id, { commute_description: "Sometime in the evening on Wednesdays, King's Cross to Acton Town. Around 10pm." });
    expect(answered.status).toBe("registered");
    expect(answered.parsed_schedule?.window_start).toBe("22:00");
  });

  it("returns an empty result with notes on Sundays", async () => {
    const api = createMockClient({ latency: () => 0 });
    const reg = await api.registerProfile({ ...BASE, commute_description: "Thursdays 10:30pm Piccadilly to Acton Town" });
    const found = await api.findMatches({ user_id: reg.user_id, day_of_week: "sun" });
    expect(found.matches).toEqual([]);
    expect(found.notes.length).toBeGreaterThan(0);
  });

  it("stops suggesting someone after they are blocked", async () => {
    const api = createMockClient({ latency: () => 0 });
    const reg = await api.registerProfile({ ...BASE, commute_description: "Thursdays 10:30pm Piccadilly to Acton Town" });
    const before = await api.findMatches({ user_id: reg.user_id });
    const partner = before.matches.find((m) => m.match_type === "walk_home_pair")!.display_names[1]!;
    await api.blockUser({ user_id: reg.user_id, blocked_display_name: partner });
    const after = await api.findMatches({ user_id: reg.user_id });
    expect(after.matches.some((m) => m.display_names.includes(partner))).toBe(false);
  });
});

describe("mock client: trust badges and languages", () => {
  const COMMUTE = "Thursdays I leave King's Cross at 10:30pm on the Piccadilly line to Acton Town.";

  it("accept → confirm → partner confirms → badges go up exactly once, with a shared-language match", async () => {
    let now = 1_000_000;
    const api = createMockClient({ latency: () => 0, now: () => now });
    const reg = await api.registerProfile({ ...BASE, commute_description: COMMUTE, languages: [{ code: "bn", proficiency: "fluent" }] });
    const found = FindMatchesResponseSchema.parse(await api.findMatches({ user_id: reg.user_id, day_of_week: "thu" }));
    const pair = found.matches.find((m) => m.match_type === "walk_home_pair")!;

    // Shared-language case: only the shared language is visible before mutual accept.
    expect(pair.display_names[1]).toBe("Mossy Otter");
    expect(pair.shared_languages).toEqual([{ code: "bn", name: "Bengali" }]);
    expect(pair.participants_trust).toEqual([{ display_name: "Mossy Otter", journeys_completed: 12, tier_label: "Trusted" }]);
    expect(pair.participant_languages ?? null).toBeNull();
    expect(JSON.stringify(found)).not.toMatch(/Sylheti/);

    // Journeys can't be logged before mutual accept.
    const early = await api.confirmJourney({ user_id: reg.user_id, match_id: pair.match_id }).catch((e: unknown) => e);
    expect((early as { status?: number }).status).toBe(409);

    await api.respond(pair.match_id, { user_id: reg.user_id, response: "accept" });
    now += 3000;
    const confirmed = RespondResponseSchema.parse(await api.respond(pair.match_id, { user_id: reg.user_id, response: "accept" }));
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.participant_languages?.[0]?.languages.map((l) => l.name)).toEqual(["English", "Bengali", "Sylheti"]);

    const waiting = JourneyConfirmResponseSchema.parse(await api.confirmJourney({ user_id: reg.user_id, match_id: pair.match_id }));
    expect(waiting).toEqual({ status: "waiting_for_partner", journeys_completed: 0, tier_label: "New" });
    expect((await api.getTrust(reg.user_id)).journeys_completed).toBe(0); // your tap alone changes nothing

    now += 3000;
    const done = await api.confirmJourney({ user_id: reg.user_id, match_id: pair.match_id });
    expect(done).toEqual({ status: "completed", journeys_completed: 1, tier_label: "First steps" });
    const again = await api.confirmJourney({ user_id: reg.user_id, match_id: pair.match_id });
    expect(again.journeys_completed).toBe(1);
    expect(TrustSummarySchema.parse(await api.getTrust(reg.user_id))).toEqual({ journeys_completed: 1, tier: "first_steps", tier_label: "First steps", next_tier_at: 5 });

    const mine = await api.listMyMatches(reg.user_id);
    expect(mine.matches.find((m) => m.match_id === pair.match_id)?.participants_trust[0]?.journeys_completed).toBe(13);
  });

  it("covers New/Regular/Trusted fixtures, the no-shared case and hidden languages", async () => {
    const api = createMockClient({ latency: () => 0 });
    const reg = await api.registerProfile({ ...BASE, commute_description: COMMUTE });
    const found = await api.findMatches({ user_id: reg.user_id, day_of_week: "thu" });
    expect(found.matches.every((m) => m.shared_languages.length === 0)).toBe(true);
    const labels = new Set(found.matches.flatMap((m) => m.participants_trust.map((t) => t.tier_label)));
    expect(labels.size).toBeGreaterThan(0);

    const tiers = new Set<string>();
    for (const name of ["Velvet Owl", "Lunar Hare", "Misty Moth", "Copper Seal", "Polar Shrew", "Dusky Bat"]) {
      const r = await api.registerProfile({ ...BASE, anonymous_display_name: name, commute_description: COMMUTE });
      const f = await api.findMatches({ user_id: r.user_id, day_of_week: "thu" });
      f.matches.forEach((m) => m.participants_trust.forEach((t) => tiers.add(t.tier_label)));
    }
    expect([...tiers]).toEqual(expect.arrayContaining(["New", "Regular", "Trusted"]));

    // Silent Moth speaks Bengali but hides their languages: never shown as shared.
    const bn = await api.registerProfile({ ...BASE, anonymous_display_name: "Gentle Heron", commute_description: COMMUTE, languages: [{ code: "bn", proficiency: "native" }] });
    const bnMatches = await api.findMatches({ user_id: bn.user_id, day_of_week: "thu" });
    for (const m of bnMatches.matches) if (m.display_names.includes("Silent Moth") && m.display_names.length === 2) expect(m.shared_languages).toEqual([]);
  });

  it("returns a helpful empty result for require_shared with no overlap, and validates PATCH", async () => {
    const api = createMockClient({ latency: () => 0 });
    const reg = await api.registerProfile({ ...BASE, commute_description: COMMUTE, languages: [{ code: "cy", proficiency: "native" }], language_matching: "require_shared" });
    const found = await api.findMatches({ user_id: reg.user_id, day_of_week: "thu" });
    expect(found.matches).toEqual([]);
    expect(found.notes[0]).toMatch(/shares one of your languages/);

    const settings = LanguageSettingsSchema.parse(await api.updateLanguages(reg.user_id, { language_matching: "prefer_shared" }));
    expect(settings).toEqual({ languages: [{ code: "cy", name: "Welsh", proficiency: "native" }], language_matching: "prefer_shared", share_languages: true });
    expect((await api.findMatches({ user_id: reg.user_id, day_of_week: "thu" })).matches.length).toBe(2);
    const bad = await api.updateLanguages(reg.user_id, { languages: [{ code: "xx", proficiency: "fluent" }] }).catch((e: unknown) => e);
    expect((bad as { status?: number }).status).toBe(422);
    expect((await api.listLanguages()).languages.length).toBeGreaterThanOrEqual(40);
  });

  it("detects languages only from explicit statements and returns them unsaved", async () => {
    const api = createMockClient({ latency: () => 0 });
    const reg = await api.registerProfile({ ...BASE, commute_description: `${COMMUTE} I speak Bengali and a bit of Spanish.`, languages: [{ code: "en", proficiency: "native" }] });
    expect(reg.detected_languages).toEqual([
      { code: "bn", name: "Bengali", proficiency: "fluent" },
      { code: "es", name: "Spanish", proficiency: "conversational" },
    ]);
    const quiet = await api.registerProfile({ ...BASE, commute_description: `I'm Priya, I'm Polish and live near Southall. ${COMMUTE}` });
    expect(quiet.detected_languages).toEqual([]);
  });
});
