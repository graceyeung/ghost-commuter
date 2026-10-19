import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useProfiles, useSession, type Session } from "@/hooks/useSession";

const make = (userId: string, displayName: string): Session => ({
  userId,
  displayName,
  createdAt: "2026-10-14T20:00:00.000Z",
  profile: null,
  parsedSchedule: null,
  needsClarification: null,
  isActive: true,
  blocked: [],
  languageSettings: null,
});

const A = make("6b1c022f-61a5-48fe-98e3-5d00a209cc1d", "Lunar Hare");
const B = make("8be3a93c-35e7-4c00-a7a2-b0f64aa4cbde", "Mossy Otter");

function useBoth() {
  return { session: useSession(), profiles: useProfiles() };
}

describe("local profiles", () => {
  it("keeps every profile, signs in as the newest, and switches between them", () => {
    const { result } = renderHook(useBoth);
    act(() => result.current.session.setSession(A));
    act(() => result.current.session.setSession(B));

    expect(result.current.profiles.profiles.map((p) => p.displayName)).toEqual(["Mossy Otter", "Lunar Hare"]);
    expect(result.current.session.session?.displayName).toBe("Mossy Otter");

    act(() => result.current.profiles.signIn(A.userId));
    expect(result.current.session.session?.displayName).toBe("Lunar Hare");
    expect(result.current.profiles.profiles[0]?.displayName).toBe("Lunar Hare");
  });

  it("updates only the signed-in profile", () => {
    const { result } = renderHook(useBoth);
    act(() => result.current.session.setSession(A));
    act(() => result.current.session.setSession(B));
    act(() => result.current.session.updateSession({ blocked: ["Tidal Stoat"] }));

    const byName = Object.fromEntries(result.current.profiles.profiles.map((p) => [p.displayName, p]));
    expect(byName["Mossy Otter"]?.blocked).toEqual(["Tidal Stoat"]);
    expect(byName["Lunar Hare"]?.blocked).toEqual([]);
  });

  it("signing out keeps the profile saved; forgetting removes it", () => {
    const { result } = renderHook(useBoth);
    act(() => result.current.session.setSession(A));
    act(() => result.current.session.signOut());
    expect(result.current.session.session).toBeNull();
    expect(result.current.profiles.profiles).toHaveLength(1);

    act(() => result.current.profiles.signIn(A.userId));
    act(() => result.current.session.forgetSession());
    expect(result.current.session.session).toBeNull();
    expect(result.current.profiles.profiles).toHaveLength(0);
  });

  it("migrates a profile saved by the older single-session version", () => {
    window.localStorage.setItem("ghost-commuter:session", JSON.stringify(A));
    const { result } = renderHook(useBoth);
    expect(result.current.session.session?.displayName).toBe("Lunar Hare");
    expect(window.localStorage.getItem("ghost-commuter:session")).toBeNull();
  });
});
