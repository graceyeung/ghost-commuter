"use client";

import Link from "next/link";
import { Ban, Flag, ShieldAlert, Sparkles } from "lucide-react";
import type { Match } from "@/lib/api/contract";
import type { useMatchResponse } from "@/hooks/useMatchResponse";
import { MATCH_TYPE_LABELS, joinNames } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CopyButton } from "@/components/shared/CopyButton";
import { LinePills } from "@/components/shared/LinePill";
import { ParticipantLanguagesList, SharedLanguages } from "@/components/languages/SharedLanguages";
import { JourneyConfirm } from "./JourneyConfirm";
import { Participants } from "./Participants";
import { PlatformPlan } from "./PlatformPlan";
import { ResponsePanel } from "./ResponsePanel";

export interface MatchDrawerProps {
  open: boolean;
  onClose: () => void;
  match: Match;
  others: string[];
  userId: string;
  response: ReturnType<typeof useMatchResponse>;
  onReport: () => void;
  onBlock: () => void;
  /** The icebreaker is written from the searcher's point of view, so it's hidden on invitations. */
  showIcebreaker?: boolean;
}

export function MatchDrawer({ open, onClose, match, others, userId, response, onReport, onBlock, showIcebreaker = true }: MatchDrawerProps) {
  const confirmed = response.phase === "confirmed";
  const unlockedLanguages = confirmed ? (response.participantLanguages ?? match.participant_languages ?? []) : [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={match.match_type === "walk_home_pair" ? `Walk home with ${joinNames(others)}` : `Study carriage with ${joinNames(others)}`}
      description={`Meet at ${match.meet_station} · ${match.assembly_instructions.meet_time}`}
      footer={<ResponsePanel response={response} others={others} matchId={match.match_id} />}
    >
      <div className="space-y-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber">{MATCH_TYPE_LABELS[match.match_type]}</Badge>
          <LinePills sharedLine={match.shared_line} />
        </div>

        <section aria-labelledby={`who-${match.match_id}`} className="space-y-3">
          <h3 id={`who-${match.match_id}`} className="text-lg font-semibold">
            Who you'd travel with
          </h3>
          <Participants names={others} trust={match.participants_trust} label="Who you'd travel with" />
          <SharedLanguages languages={match.shared_languages} group={match.match_type === "study_group"} />
          <ParticipantLanguagesList entries={unlockedLanguages} />
        </section>

        {confirmed && <JourneyConfirm matchId={match.match_id} userId={userId} />}

        <section aria-labelledby={`plan-${match.match_id}`}>
          <h3 id={`plan-${match.match_id}`} className="mb-4 text-lg font-semibold">
            Platform plan
          </h3>
          <PlatformPlan match={match} />
        </section>

        <section aria-labelledby={`why-${match.match_id}`}>
          <h3 id={`why-${match.match_id}`} className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-amber-text" aria-hidden />
            Why we matched you
          </h3>
          <ul className="flex flex-wrap gap-2">
            {match.similarity_reasons.map((reason) => (
              <li key={reason}>
                <Badge>{reason}</Badge>
              </li>
            ))}
          </ul>
        </section>

        {showIcebreaker && (
        <section aria-labelledby={`ice-${match.match_id}`} className="rounded-2xl border border-border bg-surface-2/60 p-4">
          <h3 id={`ice-${match.match_id}`} className="text-sm font-semibold uppercase tracking-wider text-muted">
            An easy first message
          </h3>
          <p className="mt-2 text-[1.05rem] leading-relaxed">“{match.icebreaker}”</p>
          <div className="mt-3">
            <CopyButton text={match.icebreaker} label="Copy message" />
          </div>
        </section>
        )}

        {match.safety_notes.length > 0 && (
          <section aria-labelledby={`safety-${match.match_id}`} className="rounded-2xl border border-info/40 bg-info/10 p-4">
            <h3 id={`safety-${match.match_id}`} className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-5 w-5 text-info" aria-hidden />
              Safety notes for this route
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              {match.safety_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Route details are mock data for this demo, not verified TfL information.</p>
          </section>
        )}

        <section aria-labelledby={`concern-${match.match_id}`} className="space-y-3">
          <h3 id={`concern-${match.match_id}`} className="font-semibold">
            Something not right?
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onReport} icon={<Flag className="h-4 w-4" aria-hidden />}>
              Report
            </Button>
            <Button variant="secondary" size="sm" onClick={onBlock} icon={<Ban className="h-4 w-4" aria-hidden />}>
              Block
            </Button>
            <Link href="/safety" className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-amber-text underline underline-offset-4">
              Safety Centre
            </Link>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
