"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Hourglass, MessagesSquare, RefreshCw, X } from "lucide-react";
import type { useMatchResponse } from "@/hooks/useMatchResponse";
import { Button, ButtonLink } from "@/components/ui/Button";
import { joinNames } from "@/lib/labels";

type ResponseApi = ReturnType<typeof useMatchResponse>;

/** Accept/Decline and every state after it. Shared by the card and the drawer so they stay in sync. */
export function ResponsePanel({ response, others, matchId, compact = false }: { response: ResponseApi; others: string[]; matchId: string; compact?: boolean }) {
  const [confirmDecline, setConfirmDecline] = useState(false);
  const { phase, members, error, checking } = response;
  const pendingNames = members.filter((m) => m.response === "pending" && others.includes(m.display_name)).map((m) => m.display_name);

  return (
    <div aria-live="polite" className="space-y-3">
      {phase === "idle" || phase === "submitting" ? (
        confirmDecline ? (
          <div className="space-y-3 rounded-xl border border-border bg-surface-2/60 p-4">
            <p className="font-semibold">Decline this match?</p>
            <p className="text-sm text-muted">They won't be told why, and you can keep looking for others.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" loading={phase === "submitting"} onClick={() => void response.decline()}>
                Yes, decline
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDecline(false)} disabled={phase === "submitting"}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button size={compact ? "md" : "lg"} loading={phase === "submitting"} onClick={() => void response.accept()} icon={<Check className="h-4 w-4" aria-hidden />}>
              Accept
            </Button>
            <Button size={compact ? "md" : "lg"} variant="secondary" disabled={phase === "submitting"} onClick={() => setConfirmDecline(true)} icon={<X className="h-4 w-4" aria-hidden />}>
              Decline
            </Button>
          </div>
        )
      ) : null}

      {phase === "pending" && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Hourglass className="h-4 w-4 text-amber-text" aria-hidden />
            Waiting for {pendingNames.length ? joinNames(pendingNames) : "them"}
          </p>
          <p className="mt-1 text-sm text-muted">You've said yes. Nothing is shared until everyone does, and there's no pressure on anyone to accept.</p>
          <Button className="mt-3" size="sm" variant="secondary" loading={checking} onClick={() => void response.checkAgain()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
            Check again
          </Button>
        </div>
      )}

      {phase === "confirmed" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="rounded-xl border border-success/40 bg-success/10 p-4 shadow-[0_0_40px_-12px_rgb(var(--success)/0.6)]"
        >
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Check className="h-5 w-5 text-success" aria-hidden />
            It's a plan. Everyone said yes.
          </p>
          <p className="mt-1 text-sm text-muted">
            Someone will be waiting at the right carriage. Say hello in the app: no numbers or social handles needed.
          </p>
          <ButtonLink href={`/chats/${matchId}`} className="mt-3 w-full sm:w-auto" icon={<MessagesSquare className="h-4 w-4" aria-hidden />}>
            Open chat with {joinNames(others)}
          </ButtonLink>
        </motion.div>
      )}

      {phase === "declined" && (
        <p className="rounded-xl border border-border bg-surface-2/60 p-4 text-sm text-muted">
          This match is closed. Nobody was told why. You can search again whenever you like.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
