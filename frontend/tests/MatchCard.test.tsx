import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MatchCard } from "@/components/matches/MatchCard";
import { ApiProvider } from "@/lib/api";
import type { GhostApi, Match, RespondResponse } from "@/lib/api/contract";
import { fakeApi as baseFakeApi } from "./fakeApi";

const USER_ID = "6b1c022f-61a5-48fe-98e3-5d00a209cc1d";
const MATCH: Match = {
  match_id: "d773df39-2db5-4f97-8b40-7e9c8642d47b",
  match_type: "walk_home_pair",
  display_names: ["Lunar Hare", "Mossy Otter"],
  shared_line: "Victoria / Piccadilly",
  meet_station: "Finsbury Park",
  assembly_instructions: {
    carriage_position: "middle carriages (cars 3-4)",
    landmark: "the ticket hall under the departure boards",
    meet_time: "22:45",
    last_mile_handoff: "Walk the main road together before splitting at a lit junction.",
  },
  icebreaker: "Hi Mossy Otter!",
  safety_notes: ["(Mock transit data) staffed late."],
  similarity_reasons: ["Departure windows line up", "You both use Finsbury Park"],
  participants_trust: [{ display_name: "Mossy Otter", journeys_completed: 12, tier_label: "Trusted" }],
  shared_languages: [{ code: "bn", name: "Bengali" }],
};

function fakeApi(responses: RespondResponse[]): GhostApi & { respond: ReturnType<typeof vi.fn> } {
  const respond = vi.fn();
  for (const r of responses) respond.mockResolvedValueOnce(r);
  return baseFakeApi({ respond });
}

const pending: RespondResponse = {
  match_id: MATCH.match_id,
  status: "pending",
  members: [
    { display_name: "Lunar Hare", response: "accepted" },
    { display_name: "Mossy Otter", response: "pending" },
  ],
  contacts: null,
};

const confirmed: RespondResponse = {
  match_id: MATCH.match_id,
  status: "confirmed",
  members: [
    { display_name: "Lunar Hare", response: "accepted" },
    { display_name: "Mossy Otter", response: "accepted" },
  ],
  contacts: [{ display_name: "Mossy Otter", contact_handle: "@mossy.otter on Signal" }],
};

function renderCard(api: GhostApi, props: Partial<Parameters<typeof MatchCard>[0]> = {}) {
  return render(
    <ApiProvider api={api}>
      <MatchCard match={MATCH} userId={USER_ID} selfName="Lunar Hare" {...props} />
    </ApiProvider>,
  );
}

describe("<MatchCard> accept flow", () => {
  it("shows anonymous names only and no contact details before mutual acceptance", () => {
    renderCard(fakeApi([]));
    const card = screen.getByRole("article");
    expect(within(card).getByRole("heading", { name: "Walk home with Mossy Otter" })).toBeInTheDocument();
    expect(within(card).getByText("Pair")).toBeInTheDocument();
    expect(within(card).getByText("Victoria line")).toBeInTheDocument();
    expect(within(card).getByText("Piccadilly line")).toBeInTheDocument();
    expect(screen.queryByText(/@mossy/)).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /report this match/i })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /block someone/i })).toBeInTheDocument();
  });

  it("accept → waiting → check again → mutual accept opens the in-app chat", async () => {
    const user = userEvent.setup();
    const api = fakeApi([pending, confirmed]);
    renderCard(api);

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(api.respond).toHaveBeenLastCalledWith(MATCH.match_id, { user_id: USER_ID, response: "accept" });
    expect(await screen.findByText("Waiting for Mossy Otter")).toBeInTheDocument();
    expect(screen.queryByText(/@mossy/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /check again/i }));
    expect(await screen.findByText(/Everyone said yes/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open chat with mossy otter/i })).toHaveAttribute("href", `/chats/${MATCH.match_id}`);
    // External handles are never shown: buddies talk in the app.
    expect(screen.queryByText(/@mossy/)).not.toBeInTheDocument();
    expect(api.respond).toHaveBeenCalledTimes(2);
  });

  it("asks for confirmation before declining", async () => {
    const user = userEvent.setup();
    const api = fakeApi([{ ...pending, status: "declined", members: [{ display_name: "Lunar Hare", response: "declined" }, { display_name: "Mossy Otter", response: "pending" }] }]);
    renderCard(api);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(api.respond).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, decline" }));
    expect(api.respond).toHaveBeenCalledWith(MATCH.match_id, { user_id: USER_ID, response: "decline" });
    expect(await screen.findByText(/This match is closed/i)).toBeInTheDocument();
  });

  it("shows a friendly error and lets the student retry when the request fails", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@/lib/api/errors");
    const api = fakeApi([]);
    api.respond.mockRejectedValueOnce(new ApiError("network", "We couldn't reach Ghost Commuter."));
    api.respond.mockResolvedValueOnce(pending);
    renderCard(api);

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach Ghost Commuter.");
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Waiting for Mossy Otter")).toBeInTheDocument();
  });

  it("restores a saved invitation and a saved confirmed match", () => {
    const { unmount } = renderCard(fakeApi([]), { invitation: true, initial: { phase: "idle", members: pending.members } });
    expect(screen.getByText("Invited you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    unmount();

    renderCard(fakeApi([]), { initial: { phase: "confirmed", members: confirmed.members } });
    expect(screen.getByRole("link", { name: /open chat/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });
});
