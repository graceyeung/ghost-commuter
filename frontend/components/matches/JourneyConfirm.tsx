"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Hourglass, RefreshCw, TrainFront } from "lucide-react";
import { useJourneyConfirm } from "@/hooks/useJourneyConfirm";
import { Button } from "@/components/ui/Button";
import { TrustBadge } from "@/components/trust/TrustBadge";

/** Shown only after mutual accept. Logs today's journey; it counts once someone else confirms too. */
export function JourneyConfirm({ matchId, userId }: { matchId: string; userId: string }) {
  const journey = useJourneyConfirm(matchId, userId);
  const reduceMotion = useReducedMotion();
  const { phase, error } = journey;

  return (
    <section aria-labelledby={`journey-${matchId}`} className="space-y-3 rounded-2xl border border-border bg-surface-2/60 p-4">
      <h3 id={`journey-${matchId}`} className="flex items-center gap-2 font-semibold">
        <TrainFront className="h-4 w-4 text-amber-text" aria-hidden />
        After your journey
      </h3>
      <div aria-live="polite" className="space-y-3">
        {(phase === "idle" || phase === "submitting") && (
          <>
            <p className="text-sm text-muted">Tap this once you've travelled together today. It only counts towards your badges when you both confirm.</p>
            <Button loading={phase === "submitting"} onClick={() => void journey.confirm()} icon={<Check className="h-4 w-4" aria-hidden />}>
              We travelled together
            </Button>
          </>
        )}

        {phase === "waiting_for_partner" && (
          <div className="rounded-xl border border-amber/40 bg-amber/10 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <Hourglass className="h-4 w-4 text-amber-text" aria-hidden />
              Waiting for them to confirm
            </p>
            <p className="mt-1 text-sm text-muted">Your confirmation is saved. Badges only change once they confirm too.</p>
            <Button className="mt-3" size="sm" variant="secondary" loading={journey.checking} onClick={() => void journey.checkAgain()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              Check again
            </Button>
          </div>
        )}

        {phase === "completed" && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="rounded-xl border border-success/40 bg-success/10 p-4"
          >
            <p className="flex items-center gap-2 font-semibold">
              <Check className="h-5 w-5 text-success" aria-hidden />
              Journey logged. Thanks for getting home together.
            </p>
            {journey.journeysCompleted !== null && journey.tierLabel && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                Your badge:
                <TrustBadge journeysCompleted={journey.journeysCompleted} tierLabel={journey.tierLabel} />
              </p>
            )}
          </motion.div>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
