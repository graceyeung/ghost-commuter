// @vitest-environment node
/**
 * Optional contract check against a running FastAPI backend. Skipped unless LIVE_BACKEND=1:
 *   LIVE_BACKEND=1 npx vitest run tests/live.backend.test.ts
 * It registers one extra fictional student in the backend's database.
 */
import { describe, expect, it } from "vitest";
import { createHttpClient } from "@/lib/api/client";

const base = process.env.LIVE_BACKEND_URL ?? "http://localhost:8000";
const live = process.env.LIVE_BACKEND === "1";

describe.skipIf(!live)("live backend contract", () => {
  const api = createHttpClient({ baseUrl: base });

  it("health", async () => {
    const health = await api.health();
    expect(health.status).toBeTruthy();
  });

  it("register → find matches → accept, all passing Zod validation", async () => {
    const reg = await api.registerProfile({
      uni_affiliation: "UCL",
      university_hub: "Euston",
      home_station: "Finsbury Park",
      gender_identity: "undisclosed",
      gender_preference: "any",
      safety_preferences: ["well_lit"],
      study_interests: ["urban planning"],
      commute_description: "Thursdays I leave Euston at 10:30pm on the Victoria line to Finsbury Park.",
      contact_handle: "@live.test on the in-app thread",
    });
    expect(reg.status).toBe("registered");

    const found = await api.findMatches({ user_id: reg.user_id, day_of_week: "thu" });
    expect(Array.isArray(found.matches)).toBe(true);

    const first = found.matches[0];
    if (first) {
      const closed = await api.listMessages(first.match_id, reg.user_id).catch((e: unknown) => e);
      expect((closed as { status?: number }).status).toBe(409);
      const res = await api.respond(first.match_id, { user_id: reg.user_id, response: "accept" });
      expect(["pending", "confirmed"]).toContain(res.status);
      const mine = await api.listMyMatches(reg.user_id);
      const listed = mine.matches.find((m) => m.match_id === first.match_id);
      expect(listed?.my_response).toBe("accepted");
      expect(listed?.display_names[0]).toBe(reg.anonymous_display_name);
    }

    const block = await api.blockUser({ user_id: reg.user_id, blocked_display_name: "Nobody Here" });
    expect(block.delivered).toBe("this_device");
  }, 120_000);

  it("languages + trust: require_shared filtering, shared-only disclosure, two-sided journey confirmation", async () => {
    // A rare language and a random night keep earlier runs' students out of this pair.
    const rare = ["ti", "am", "ha", "ig", "tw", "si", "ne", "ku", "lt", "hu"][Math.floor(Math.random() * 10)]!;
    const day = (["mon", "tue", "wed"] as const)[Math.floor(Math.random() * 3)]!;
    const dayWord = { mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays" }[day];
    const commute = `${dayWord} I leave Holborn at 9:10pm on the Central line to Leytonstone.`;
    const base = { uni_affiliation: "UCL", university_hub: "Holborn", home_station: "Leytonstone", commute_description: commute, language_matching: "require_shared" as const };
    const a = await api.registerProfile({ ...base, languages: [{ code: rare, proficiency: "native" }, { code: "fr", proficiency: "fluent" }] });
    const b = await api.registerProfile({ ...base, languages: [{ code: rare, proficiency: "fluent" }, { code: "de", proficiency: "fluent" }] });

    const found = await api.findMatches({ user_id: b.user_id, day_of_week: day });
    const pair = found.matches.find((m) => m.match_type === "walk_home_pair" && m.display_names.includes(a.anonymous_display_name));
    expect(pair).toBeDefined();
    // require_shared: everyone in every suggestion shares the rare language with B.
    expect(found.matches.every((m) => m.shared_languages.some((l) => l.code === rare))).toBe(true);
    expect(pair!.participants_trust).toEqual([{ display_name: a.anonymous_display_name, journeys_completed: 0, tier_label: "New" }]);
    expect(JSON.stringify(found)).not.toMatch(/French|German/);
    expect(pair!.participant_languages ?? null).toBeNull();

    await api.respond(pair!.match_id, { user_id: a.user_id, response: "accept" });
    const done = await api.respond(pair!.match_id, { user_id: b.user_id, response: "accept" });
    expect(done.status).toBe("confirmed");
    expect(done.participant_languages?.[0]?.languages.map((l) => l.code).sort()).toEqual(["fr", rare].sort());

    const first = await api.confirmJourney({ user_id: a.user_id, match_id: pair!.match_id });
    expect(first).toEqual({ status: "waiting_for_partner", journeys_completed: 0, tier_label: "New" });
    const second = await api.confirmJourney({ user_id: b.user_id, match_id: pair!.match_id });
    expect(second).toEqual({ status: "completed", journeys_completed: 1, tier_label: "First steps" });
    await api.confirmJourney({ user_id: b.user_id, match_id: pair!.match_id });
    expect(await api.getTrust(a.user_id)).toEqual({ journeys_completed: 1, tier: "first_steps", tier_label: "First steps", next_tier_at: 5 });

    const settings = await api.updateLanguages(a.user_id, { share_languages: false });
    expect(settings.share_languages).toBe(false);
    const after = await api.listMyMatches(b.user_id);
    expect(after.matches.find((m) => m.match_id === pair!.match_id)?.participant_languages).toEqual([]);
  }, 120_000);

  it("clarification path via add-schedule", async () => {
    const reg = await api.registerProfile({
      uni_affiliation: "UCL",
      university_hub: "Euston",
      home_station: "Finsbury Park",
      commute_description: "Sometime in the evening, heading home.",
    });
    if (reg.status === "needs_clarification") {
      expect(reg.clarification_question).toBeTruthy();
      const answered = await api.addSchedule(reg.user_id, {
        commute_description: "Thursdays I leave Euston at 10:30pm on the Victoria line to Finsbury Park.",
      });
      expect(answered.status).toBe("registered");
    }
  }, 120_000);
});
