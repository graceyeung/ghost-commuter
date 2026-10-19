"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemberStatus, ParticipantLanguages, UnlockedContact } from "@/lib/api/contract";
import { friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";

export type ResponsePhase = "idle" | "submitting" | "pending" | "confirmed" | "declined";

export interface MatchResponseState {
  phase: ResponsePhase;
  members: MemberStatus[];
  contacts: UnlockedContact[];
  /** Unlocked by mutual accept, like contacts: only for people who chose to show their languages. */
  participantLanguages: ParticipantLanguages[] | null;
  error: string | null;
  checking: boolean;
}

const POLL_MS = 8000;
const MAX_POLLS = 12;

export interface InitialResponse {
  phase: ResponsePhase;
  members: MemberStatus[];
}

/**
 * Accept/decline for one match. Re-sending "accept" is idempotent on the backend and returns the
 * current status, so "check again" and the gentle auto-poll both reuse the respond endpoint.
 */
export function useMatchResponse(matchId: string, userId: string, initial?: InitialResponse) {
  const api = useApi();
  const [state, setState] = useState<MatchResponseState>({
    phase: initial?.phase ?? "idle",
    members: initial?.members ?? [],
    contacts: [],
    participantLanguages: null,
    error: null,
    checking: false,
  });
  const polls = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (response: "accept" | "decline", background = false) => {
      setState((s) => (background ? { ...s, checking: true, error: null } : { ...s, phase: "submitting", error: null }));
      try {
        const result = await api.respond(matchId, { user_id: userId, response });
        if (!mounted.current) return;
        setState({
          phase: result.status,
          members: result.members,
          contacts: result.contacts ?? [],
          participantLanguages: result.participant_languages ?? null,
          error: null,
          checking: false,
        });
      } catch (error) {
        if (!mounted.current) return;
        setState((s) => ({
          ...s,
          phase: background ? s.phase : s.phase === "submitting" ? (s.members.length ? "pending" : "idle") : s.phase,
          error: friendlyMessage(error),
          checking: false,
        }));
      }
    },
    [api, matchId, userId],
  );

  const accept = useCallback(() => {
    polls.current = 0;
    return send("accept");
  }, [send]);
  const decline = useCallback(() => send("decline"), [send]);
  const checkAgain = useCallback(() => send("accept", true), [send]);

  // While waiting for the others, check again every few seconds (bounded, and only while mounted).
  useEffect(() => {
    if (state.phase !== "pending" || state.checking || polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      polls.current += 1;
      void checkAgain();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.checking, checkAgain]);

  return { ...state, accept, decline, checkAgain };
}
