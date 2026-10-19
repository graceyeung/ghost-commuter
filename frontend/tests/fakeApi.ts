import { vi } from "vitest";
import type { GhostApi } from "@/lib/api/contract";

/** A GhostApi whose methods reject unless a test overrides them. */
export function fakeApi<T extends Partial<GhostApi>>(overrides: T = {} as T): GhostApi & T {
  const unused = () => Promise.reject(new Error("not used in this test"));
  return {
    kind: "mock",
    health: unused,
    registerProfile: unused,
    addSchedule: unused,
    findMatches: unused,
    respond: unused,
    listMyMatches: unused,
    listMessages: unused,
    sendMessage: unused,
    confirmJourney: unused,
    getTrust: unused,
    updateLanguages: unused,
    listLanguages: vi.fn().mockRejectedValue(new Error("offline")),
    reportMatch: unused,
    blockUser: unused,
    updateProfile: unused,
    deleteUser: unused,
    ...overrides,
  };
}
