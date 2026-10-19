"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";

export type JourneyPhase = "idle" | "submitting" | "waiting_for_partner" | "completed";

export interface JourneyConfirmState {
  phase: JourneyPhase;
  journeysCompleted: number | null;
  tierLabel: string | null;
  error: string | null;
  checking: boolean;
}

const POLL_MS = 5000;
const MAX_POLLS = 12;

/**
 * "We travelled together" for one match (today). Re-sending is idempotent on the backend and returns
 * the current state, so "check again" and the bounded auto-poll reuse the confirm endpoint.
 */
export function useJourneyConfirm(matchId: string, userId: string) {
  const api = useApi();
  const [state, setState] = useState<JourneyConfirmState>({ phase: "idle", journeysCompleted: null, tierLabel: null, error: null, checking: false });
  const polls = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (background: boolean) => {
      setState((s) => (background ? { ...s, checking: true, error: null } : { ...s, phase: "submitting", error: null }));
      try {
        const result = await api.confirmJourney({ user_id: userId, match_id: matchId });
        if (!mounted.current) return;
        setState({ phase: result.status, journeysCompleted: result.journeys_completed, tierLabel: result.tier_label, error: null, checking: false });
      } catch (error) {
        if (!mounted.current) return;
        setState((s) => ({ ...s, phase: s.phase === "submitting" ? "idle" : s.phase, error: friendlyMessage(error), checking: false }));
      }
    },
    [api, matchId, userId],
  );

  const confirm = useCallback(() => {
    polls.current = 0;
    return send(false);
  }, [send]);
  const checkAgain = useCallback(() => send(true), [send]);

  useEffect(() => {
    if (state.phase !== "waiting_for_partner" || state.checking || polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      polls.current += 1;
      void checkAgain();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.checking, checkAgain]);

  return { ...state, confirm, checkAgain };
}
