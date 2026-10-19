import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrustBadge } from "@/components/trust/TrustBadge";
import { MatchCard } from "@/components/matches/MatchCard";
import { ApiProvider } from "@/lib/api";
import type { JourneyConfirmResponse, Match } from "@/lib/api/contract";
import { tierProgress, trustSummary } from "@/lib/trust";
import { fakeApi } from "./fakeApi";

const USER_ID = "6b1c022f-61a5-48fe-98e3-5d00a209cc1d";
const MATCH: Match = {
  match_id: "d773df39-2db5-4f97-8b40-7e9c8642d47b",
  match_type: "walk_home_pair",
  display_names: ["Lunar Hare", "Mossy Otter"],
  shared_line: "Victoria",
  meet_station: "Finsbury Park",
  assembly_instructions: { carriage_position: "middle carriages", landmark: "the help point", meet_time: "22:45", last_mile_handoff: "Walk the lit main road." },
  icebreaker: "Hi Mossy Otter!",
  safety_notes: [],
  similarity_reasons: ["Departure windows line up"],
  participants_trust: [{ display_name: "Mossy Otter", journeys_completed: 12, tier_label: "Trusted" }],
  shared_languages: [],
};

describe("<TrustBadge>", () => {
  it.each([
    [0, "New", "0 journeys"],
    [1, "First steps", "1 journey"],
    [7, "Regular", "7 journeys"],
    [12, "Trusted", "12 journeys"],
    [30, "Commute veteran", "30 journeys"],
  ])("renders %i journeys as %s with the count written out (not colour-only)", (count, label, text) => {
    const summary = trustSummary(count);
    expect(summary.tier_label).toBe(label);
    render(<TrustBadge journeysCompleted={count} tierLabel={summary.tier_label} displayName="Mossy Otter" />);
    const button = screen.getByRole("button", { name: new RegExp(`Mossy Otter: ${label}, ${text}`) });
    expect(button).toHaveTextContent(label);
    expect(button).toHaveTextContent(text);
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("explains itself in a keyboard-operable popover", async () => {
    const user = userEvent.setup();
    render(<TrustBadge journeysCompleted={12} tierLabel="Trusted" />);
    const button = screen.getByRole("button", { name: /Trusted, 12 journeys/ });
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("note")).toHaveTextContent("Counted only when both of you confirm");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("shows progress to the next tier", () => {
    expect(tierProgress(trustSummary(7))).toEqual({ fraction: 0.4, text: "3 more journeys to Trusted" });
    expect(tierProgress(trustSummary(25)).fraction).toBe(1);
  });

  it("appears next to each name on the match card, without any journey history", () => {
    render(
      <ApiProvider api={fakeApi()}>
        <MatchCard match={MATCH} userId={USER_ID} selfName="Lunar Hare" />
      </ApiProvider>,
    );
    expect(screen.getByRole("button", { name: /Mossy Otter: Trusted, 12 journeys/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('"We travelled together"', () => {
  const confirmed = { phase: "confirmed" as const, members: [{ display_name: "Lunar Hare", response: "accepted" as const }, { display_name: "Mossy Otter", response: "accepted" as const }] };

  it("is hidden until everyone has accepted", async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider api={fakeApi()}>
        <MatchCard match={MATCH} userId={USER_ID} selfName="Lunar Hare" initial={{ phase: "pending", members: confirmed.members }} />
      </ApiProvider>,
    );
    await user.click(screen.getByRole("button", { name: /see the platform plan/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "We travelled together" })).not.toBeInTheDocument();
  });

  it("goes idle → waiting for them → completed, and shows the updated badge", async () => {
    const user = userEvent.setup();
    const waiting: JourneyConfirmResponse = { status: "waiting_for_partner", journeys_completed: 4, tier_label: "First steps" };
    const done: JourneyConfirmResponse = { status: "completed", journeys_completed: 5, tier_label: "Regular" };
    const confirmJourney = vi.fn().mockResolvedValueOnce(waiting).mockResolvedValueOnce(done);
    render(
      <ApiProvider api={fakeApi({ confirmJourney })}>
        <MatchCard match={MATCH} userId={USER_ID} selfName="Lunar Hare" initial={confirmed} />
      </ApiProvider>,
    );
    await user.click(screen.getByRole("button", { name: /see the platform plan/i }));
    await user.click(screen.getByRole("button", { name: "We travelled together" }));
    expect(confirmJourney).toHaveBeenLastCalledWith({ user_id: USER_ID, match_id: MATCH.match_id });
    expect(await screen.findByText("Waiting for them to confirm")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /check again/i }));
    expect(await screen.findByText(/Journey logged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regular, 5 journeys/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "We travelled together" })).not.toBeInTheDocument();
  });
});
