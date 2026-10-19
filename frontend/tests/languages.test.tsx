import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguagePicker } from "@/components/languages/LanguagePicker";
import { LanguageMatchingFields } from "@/components/languages/LanguageMatchingFields";
import { MatchCard } from "@/components/matches/MatchCard";
import { MatchesDashboard } from "@/components/matches/MatchesDashboard";
import { ScheduleSummary } from "@/components/onboarding/ScheduleSummary";
import { ApiProvider } from "@/lib/api";
import type { LanguageIn, LanguageMatching, Match, ParsedSchedule } from "@/lib/api/contract";
import { createMockClient } from "@/lib/api/mock";
import type { Session } from "@/hooks/useSession";
import { fakeApi } from "./fakeApi";

function PickerHarness({ onChange }: { onChange: (value: LanguageIn[]) => void }) {
  const [value, setValue] = useState<LanguageIn[]>([]);
  return (
    <>
      <label htmlFor="langs">Languages</label>
      <LanguagePicker
        id="langs"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

describe("<LanguagePicker>", () => {
  it("searches, adds with the keyboard, sets proficiency and removes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ApiProvider api={fakeApi()}>
        <PickerHarness onChange={onChange} />
      </ApiProvider>,
    );
    const box = screen.getByRole("combobox", { name: "Languages" });
    await user.type(box, "beng");
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Bengali"]);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith([{ code: "bn", proficiency: "fluent" }]);

    await user.type(box, "span");
    await user.click(screen.getByRole("option", { name: /Spanish/ }));
    await user.selectOptions(screen.getByLabelText("How well you speak Spanish"), "conversational");
    expect(onChange).toHaveBeenLastCalledWith([
      { code: "bn", proficiency: "fluent" },
      { code: "es", proficiency: "conversational" },
    ]);

    // Chosen languages aren't offered again.
    await user.clear(box);
    await user.type(box, "beng");
    expect(screen.queryByRole("option", { name: /Bengali/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Bengali" }));
    expect(onChange).toHaveBeenLastCalledWith([{ code: "es", proficiency: "conversational" }]);
  });

  it("offers three plain-language choices and a show-my-languages toggle", async () => {
    const user = userEvent.setup();
    const onMatching = vi.fn();
    const onShare = vi.fn();
    function Harness() {
      const [matching, setMatching] = useState<LanguageMatching>("prefer_shared");
      return (
        <LanguageMatchingFields
          idPrefix="t"
          matching={matching}
          onMatchingChange={(v) => {
            setMatching(v);
            onMatching(v);
          }}
          share
          onShareChange={onShare}
        />
      );
    }
    render(<Harness />);
    const group = screen.getByRole("group", { name: "How much should language matter?" });
    expect(within(group).getAllByRole("radio").map((r) => r.closest("label")?.querySelector("span span")?.textContent)).toEqual([
      "Doesn't matter",
      "Prefer a shared language",
      "Only match me with a shared language",
    ]);
    expect(within(group).getByRole("radio", { name: /Prefer a shared language/ })).toBeChecked();
    await user.click(within(group).getByRole("radio", { name: /Only match me/ }));
    expect(onMatching).toHaveBeenLastCalledWith("require_shared");
    await user.click(screen.getByRole("switch", { name: "Show my languages to matches" }));
    expect(onShare).toHaveBeenLastCalledWith(false);
  });
});

describe("languages on match cards", () => {
  const MATCH: Match = {
    match_id: "d773df39-2db5-4f97-8b40-7e9c8642d47b",
    match_type: "walk_home_pair",
    display_names: ["Lunar Hare", "Mossy Otter"],
    shared_line: "Victoria",
    meet_station: "Finsbury Park",
    assembly_instructions: { carriage_position: "middle", landmark: "help point", meet_time: "22:45", last_mile_handoff: "Walk the lit main road." },
    icebreaker: "Hi!",
    safety_notes: [],
    similarity_reasons: ["Shared study interest: urban planning"],
    participants_trust: [{ display_name: "Mossy Otter", journeys_completed: 0, tier_label: "New" }],
    shared_languages: [{ code: "en", name: "English" }, { code: "bn", name: "Bengali" }],
  };

  it("before mutual accept shows only shared languages, as distinct chips", () => {
    render(
      <ApiProvider api={fakeApi()}>
        <MatchCard match={MATCH} userId="6b1c022f-61a5-48fe-98e3-5d00a209cc1d" selfName="Lunar Hare" />
      </ApiProvider>,
    );
    const shared = screen.getByRole("list", { name: "Languages you both speak" });
    expect(screen.getByText("You both speak:")).toBeInTheDocument();
    expect(within(shared).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["English", "Bengali"]);
    expect(shared.closest("div")).not.toBe(screen.getByRole("list", { name: "Why we matched you" }).closest("div"));
    expect(screen.queryByRole("list", { name: "Languages your matches speak" })).not.toBeInTheDocument();
  });

  it("after mutual accept shows each participant's languages they chose to share", async () => {
    const user = userEvent.setup();
    const respond = vi.fn().mockResolvedValue({
      match_id: MATCH.match_id,
      status: "confirmed",
      members: [{ display_name: "Lunar Hare", response: "accepted" }, { display_name: "Mossy Otter", response: "accepted" }],
      contacts: [],
      participant_languages: [{ display_name: "Mossy Otter", languages: [{ code: "bn", name: "Bengali", proficiency: "native" }, { code: "syl", name: "Sylheti", proficiency: "conversational" }] }],
    });
    render(
      <ApiProvider api={fakeApi({ respond })}>
        <MatchCard match={MATCH} userId="6b1c022f-61a5-48fe-98e3-5d00a209cc1d" selfName="Lunar Hare" />
      </ApiProvider>,
    );
    expect(screen.queryByText(/Sylheti/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/Bengali \(native\), Sylheti \(conversational\)/)).toBeInTheDocument();
  });
});

describe('"Here\'s what we understood" languages', () => {
  const schedule: ParsedSchedule = {
    origin_station: "Euston",
    destination_station: "Finsbury Park",
    line: "Victoria",
    days: ["thu"],
    window_start: "22:30",
    window_end: "23:00",
    study_interests: [],
    safety_preferences: [],
    confidence: 0.9,
  };

  it("shows detected languages as removable chips and saves only the kept ones on confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ScheduleSummary
        schedule={schedule}
        detectedLanguages={[{ code: "bn", name: "Bengali", proficiency: "fluent" }, { code: "en", name: "English", proficiency: "fluent" }]}
        onConfirmLanguages={onConfirm}
      />,
    );
    const chips = screen.getByRole("list", { name: "Languages found in your description" });
    expect(within(chips).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove English" }));
    await user.click(screen.getByRole("button", { name: "Add it to my profile" }));
    expect(onConfirm).toHaveBeenCalledWith([{ code: "bn", name: "Bengali", proficiency: "fluent" }]);
  });
});

describe("require_shared empty state", () => {
  it("suggests prefer_shared instead of showing an error, and can switch in one tap", async () => {
    const user = userEvent.setup();
    const api = createMockClient({ latency: () => 0 });
    const reg = await api.registerProfile({
      uni_affiliation: "UCL",
      university_hub: "Euston",
      home_station: "Finsbury Park",
      commute_description: "Thursdays I leave Euston at 10:30pm on the Victoria line to Finsbury Park.",
      languages: [{ code: "cy", proficiency: "native" }],
      language_matching: "require_shared",
    });
    const session: Session = {
      userId: reg.user_id,
      displayName: reg.anonymous_display_name,
      createdAt: new Date().toISOString(),
      profile: null,
      parsedSchedule: reg.parsed_schedule ?? null,
      needsClarification: null,
      isActive: true,
      blocked: [],
      languageSettings: { languages: [{ code: "cy", name: "Welsh", proficiency: "native" }], language_matching: "require_shared", share_languages: true },
    };
    window.localStorage.setItem("ghost-commuter:profiles", JSON.stringify({ activeId: session.userId, profiles: [session] }));

    render(
      <ApiProvider api={api}>
        <MatchesDashboard />
      </ApiProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /find my commute buddies/i }));
    expect(await screen.findByText(/Try “Prefer a shared language” to see more people/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No matches this time" })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't finish that search/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Switch to “Prefer a shared language”/ }));
    expect(await screen.findByRole("heading", { name: /2 suggestions/ })).toBeInTheDocument();
  });
});
