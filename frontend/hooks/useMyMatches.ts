"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MyMatch } from "@/lib/api/contract";
import { friendlyMessage } from "@/lib/api/errors";
import type { ResponsePhase } from "@/hooks/useMatchResponse";
import { useApi } from "@/lib/api";

export interface GroupedMatches {
  /** Someone else's search matched you and you haven't answered yet. */
  invitations: MyMatch[];
  /** You accepted; waiting for the others. */
  waiting: MyMatch[];
  /** Everyone accepted: chat is open. */
  confirmed: MyMatch[];
}

export function phaseFor(match: MyMatch): ResponsePhase {
  if (match.status === "confirmed") return "confirmed";
  if (match.status === "declined" || match.my_response === "declined") return "declined";
  if (match.my_response === "accepted") return "pending";
  return "idle";
}

/**
 * Each search creates fresh match rows, so the same people can appear many times. Keep the newest
 * row per (type, people), preferring the most advanced state, and drop your own unanswered past
 * search results (they live on the search screen, not here).
 */
export function groupMatches(matches: MyMatch[], blocked: readonly string[]): GroupedMatches {
  const rank: Record<ResponsePhase, number> = { confirmed: 3, pending: 2, idle: 1, submitting: 1, declined: 0 };
  const best = new Map<string, MyMatch>();
  for (const match of matches) {
    if (match.display_names.slice(1).some((name) => blocked.includes(name))) continue;
    const phase = phaseFor(match);
    if (phase === "declined") continue;
    if (phase === "idle" && match.you_requested) continue;
    const key = `${match.match_type}|${[...match.display_names].sort().join("|")}`;
    const current = best.get(key);
    if (!current || rank[phase] > rank[phaseFor(current)]) best.set(key, match);
  }
  const all = [...best.values()];
  return {
    invitations: all.filter((m) => phaseFor(m) === "idle"),
    waiting: all.filter((m) => phaseFor(m) === "pending"),
    confirmed: all.filter((m) => phaseFor(m) === "confirmed"),
  };
}

type State = { status: "loading" } | { status: "ready"; matches: MyMatch[] } | { status: "error"; message: string };

export function useMyMatches(userId: string | null) {
  const api = useApi();
  const [state, setState] = useState<State>({ status: "loading" });
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const id = ++latest.current;
    try {
      const { matches } = await api.listMyMatches(userId);
      if (id === latest.current) setState({ status: "ready", matches });
    } catch (error) {
      if (id === latest.current) setState({ status: "error", message: friendlyMessage(error) });
    }
  }, [api, userId]);

  useEffect(() => {
    setState({ status: "loading" });
    void refresh();
  }, [refresh]);

  return { state, refresh };
}
