"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/api/contract";
import { ApiError, friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";
import { randomId } from "@/lib/storage";

export interface LocalMessage extends ChatMessage {
  /** Optimistic messages are "sending" until the server confirms; "failed" ones can be retried. */
  delivery?: "sending" | "failed";
}

type Status = "loading" | "ready" | "not_open" | "error";

const POLL_MS = 5000;
const BACKOFF_MS = 20000;

/**
 * Loads a match's messages, then polls for newer ones while the tab is visible.
 * The backend rate-limits per client, so polling is modest and backs off on 429s.
 */
export function useChat(matchId: string, userId: string | null, selfName: string) {
  const api = useApi();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const lastSentAt = useRef<string | undefined>(undefined);
  const delay = useRef(POLL_MS);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    lastSentAt.current = incoming[incoming.length - 1]?.sent_at ?? lastSentAt.current;
    setMessages((current) => {
      const known = new Set(current.map((m) => m.message_id));
      return [...current, ...incoming.filter((m) => !known.has(m.message_id))];
    });
  }, []);

  const poll = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await api.listMessages(matchId, userId, lastSentAt.current);
      merge(result.messages);
      setStatus("ready");
      setError(null);
      delay.current = POLL_MS;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStatus("not_open");
      else if (err instanceof ApiError && err.kind === "rate_limited") delay.current = BACKOFF_MS;
      else {
        setStatus((s) => (s === "loading" ? "error" : s));
        setError(friendlyMessage(err));
      }
    }
  }, [api, matchId, userId, merge]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (cancelled) return;
      if (typeof document === "undefined" || document.visibilityState === "visible") await poll();
      if (!cancelled) timer = setTimeout(loop, delay.current);
    };
    setMessages([]);
    lastSentAt.current = undefined;
    setStatus("loading");
    void loop();
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, poll]);

  const send = useCallback(
    async (body: string, retryId?: string) => {
      if (!userId) return;
      const tempId = retryId ?? `temp-${randomId()}`;
      const optimistic: LocalMessage = {
        message_id: tempId,
        match_id: matchId,
        sender_display_name: selfName,
        mine: true,
        body,
        sent_at: new Date().toISOString(),
        delivery: "sending",
      };
      setMessages((current) => (retryId ? current.map((m) => (m.message_id === retryId ? optimistic : m)) : [...current, optimistic]));
      try {
        const saved = await api.sendMessage(matchId, { user_id: userId, body });
        setMessages((current) => {
          const withoutTemp = current.filter((m) => m.message_id !== tempId);
          return withoutTemp.some((m) => m.message_id === saved.message_id) ? withoutTemp : [...withoutTemp, saved];
        });
        // The poll cursor is not advanced here: a buddy's message saved just before ours must still be fetched.
        setError(null);
      } catch (err) {
        setMessages((current) => current.map((m) => (m.message_id === tempId ? { ...m, delivery: "failed" } : m)));
        setError(friendlyMessage(err));
      }
    },
    [api, matchId, userId, selfName],
  );

  return { messages, status, error, send, refresh: poll };
}
