import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { createMockClient } from "@/lib/api/mock";
import { ApiError } from "@/lib/api/errors";
import { MessagesResponseSchema, MyMatchesResponseSchema } from "@/lib/api/contract";

async function confirmedPair() {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const api = createMockClient({ latency: () => 0, now: () => now });
  const reg = await api.registerProfile({
    uni_affiliation: "UCL",
    university_hub: "King's Cross St Pancras",
    home_station: "Acton Town",
    commute_description: "Thursdays 10:30pm Piccadilly line to Acton Town",
  });
  const found = await api.findMatches({ user_id: reg.user_id, day_of_week: "thu" });
  const pair = found.matches.find((m) => m.match_type === "walk_home_pair")!;
  return { api, clock, userId: reg.user_id, pair };
}

describe("mock chat", () => {
  it("is closed until everyone accepts, then the buddy says hello", async () => {
    const { api, clock, userId, pair } = await confirmedPair();
    const closed = await api.listMessages(pair.match_id, userId).catch((e: unknown) => e);
    expect(closed).toBeInstanceOf(ApiError);
    expect((closed as ApiError).status).toBe(409);

    await api.respond(pair.match_id, { user_id: userId, response: "accept" });
    clock.advance(3000);
    await api.respond(pair.match_id, { user_id: userId, response: "accept" });

    const mine = MyMatchesResponseSchema.parse(await api.listMyMatches(userId));
    expect(mine.matches.find((m) => m.match_id === pair.match_id)?.status).toBe("confirmed");

    const first = MessagesResponseSchema.parse(await api.listMessages(pair.match_id, userId));
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]).toMatchObject({ sender_display_name: pair.display_names[1], mine: false });
  });

  it("redacts addresses, and the buddy's reply arrives a few seconds later", async () => {
    const { api, clock, userId, pair } = await confirmedPair();
    await api.respond(pair.match_id, { user_id: userId, response: "accept" });
    clock.advance(3000);
    const opening = await api.listMessages(pair.match_id, userId);
    const cursor = opening.messages[opening.messages.length - 1]!.sent_at;
    clock.advance(1000);

    const sent = await api.sendMessage(pair.match_id, { user_id: userId, body: "Meet at 12 Elm Road, N4 3HF?" });
    expect(sent.mine).toBe(true);
    expect(sent.body).not.toMatch(/Elm Road|N4 3HF/);
    expect(sent.body).toContain("[redacted]");

    const immediately = await api.listMessages(pair.match_id, userId, cursor);
    expect(immediately.messages.map((m) => m.mine)).toEqual([true]);

    clock.advance(5000);
    const later = await api.listMessages(pair.match_id, userId, cursor);
    expect(later.messages.map((m) => m.mine)).toEqual([true, false]);
    expect(later.messages[1]?.body).toMatch(/station/i);
  });
});

describe("<ChatComposer>", () => {
  it("sends on Enter and clears the box", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    await user.type(screen.getByLabelText("Message"), "See you at the help point{Enter}");
    expect(onSend).toHaveBeenCalledWith("See you at the help point");
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("blocks sending a postcode or phone number", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    await user.type(screen.getByLabelText("Message"), "my number is 07700 900123{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText(/a phone number/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("offers one-tap quick replies", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    await user.click(screen.getByRole("button", { name: "Running 5 min late" }));
    expect(onSend).toHaveBeenCalledWith("Running 5 min late");
  });
});
