import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MatchCard } from "@/components/matches/MatchCard";
import { ApiProvider } from "@/lib/api";
import type { Match } from "@/lib/api/contract";
import { fakeApi } from "./fakeApi";

// framer-motion reads prefers-reduced-motion once per module graph, so this file sets it before
// anything renders (vitest isolates modules per test file).
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

const MATCH: Match = {
  match_id: "d773df39-2db5-4f97-8b40-7e9c8642d47b",
  match_type: "walk_home_pair",
  display_names: ["Lunar Hare", "Mossy Otter"],
  shared_line: "Victoria",
  meet_station: "Finsbury Park",
  assembly_instructions: { carriage_position: "middle", landmark: "help point", meet_time: "22:45", last_mile_handoff: "Walk the lit main road." },
  icebreaker: "Hi!",
  safety_notes: [],
  similarity_reasons: [],
  participants_trust: [{ display_name: "Mossy Otter", journeys_completed: 0, tier_label: "New" }],
  shared_languages: [],
};

describe("journey celebration with prefers-reduced-motion", () => {
  it("renders the completed state without an entrance animation", async () => {
    const user = userEvent.setup();
    const confirmJourney = vi.fn().mockResolvedValue({ status: "completed", journeys_completed: 1, tier_label: "First steps" });
    const members = [{ display_name: "Lunar Hare", response: "accepted" as const }, { display_name: "Mossy Otter", response: "accepted" as const }];
    render(
      <ApiProvider api={fakeApi({ confirmJourney })}>
        <MatchCard match={MATCH} userId="6b1c022f-61a5-48fe-98e3-5d00a209cc1d" selfName="Lunar Hare" initial={{ phase: "confirmed", members }} />
      </ApiProvider>,
    );
    await user.click(screen.getByRole("button", { name: /see the platform plan/i }));
    await user.click(screen.getByRole("button", { name: "We travelled together" }));
    const message = await screen.findByText(/Journey logged/);
    expect(message.closest("div")?.getAttribute("style") ?? "").not.toMatch(/opacity: 0/);
  });
});
