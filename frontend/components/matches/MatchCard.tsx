"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Ban, BookOpen, ChevronRight, Clock3, Flag, Footprints, MapPin } from "lucide-react";
import type { Match } from "@/lib/api/contract";
import { useMatchResponse, type InitialResponse } from "@/hooks/useMatchResponse";
import { MATCH_TYPE_LABELS, joinNames } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { LinePills } from "@/components/shared/LinePill";
import { ParticipantLanguagesList, SharedLanguages } from "@/components/languages/SharedLanguages";
import { BlockDialog } from "./BlockDialog";
import { MatchDrawer } from "./MatchDrawer";
import { Participants } from "./Participants";
import { ReportDialog } from "./ReportDialog";
import { ResponsePanel } from "./ResponsePanel";

export interface MatchCardProps {
  match: Match;
  userId: string;
  /** The current student's anonymous name, filtered out of the member list. */
  selfName: string;
  index?: number;
  /** Saved state for a match loaded from "my matches" (instead of a fresh search). */
  initial?: InitialResponse;
  /** True when another student's search produced this match. */
  invitation?: boolean;
}

export function MatchCard({ match, userId, selfName, index = 0, initial, invitation = false }: MatchCardProps) {
  const response = useMatchResponse(match.match_id, userId, initial);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  // The backend lists the requester first; filter by name, falling back to position.
  const withoutSelf = match.display_names.filter((name) => name !== selfName);
  const others = withoutSelf.length < match.display_names.length ? withoutSelf : match.display_names.slice(1);
  const pair = match.match_type === "walk_home_pair";
  const titleId = `match-${match.match_id}-title`;
  // Full language lists only exist after mutual accept (from respond, or a saved confirmed match).
  const unlockedLanguages = response.phase === "confirmed" ? (response.participantLanguages ?? match.participant_languages ?? []) : [];

  return (
    <motion.article
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06 }}
    >
      <Card className="h-full">
        <CardBody className="flex h-full flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">
              {pair ? <Footprints className="h-3.5 w-3.5" aria-hidden /> : <BookOpen className="h-3.5 w-3.5" aria-hidden />}
              {pair ? "Pair" : "Study group"}
              <span className="sr-only">: {MATCH_TYPE_LABELS[match.match_type]}</span>
            </Badge>
            <LinePills sharedLine={match.shared_line} />
            {invitation && <Badge tone="info">Invited you</Badge>}
          </div>

          <div>
            <h3 id={titleId} className="text-xl font-semibold leading-snug">
              {pair ? `Walk home with ${joinNames(others)}` : `Study carriage with ${joinNames(others)}`}
            </h3>
            <div className="mt-2">
              <Participants names={others} trust={match.participants_trust} />
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-amber-text" aria-hidden />
                Meet at <strong className="text-ink">{match.meet_station}</strong>
              </li>
              <li className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 shrink-0 text-amber-text" aria-hidden />
                {match.assembly_instructions.meet_time} · {match.assembly_instructions.carriage_position}
              </li>
            </ul>
          </div>

          <SharedLanguages languages={match.shared_languages} group={!pair} />
          <ParticipantLanguagesList entries={unlockedLanguages} />

          {match.similarity_reasons.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Why we matched you">
              {match.similarity_reasons.slice(0, 3).map((reason) => (
                <li key={reason}>
                  <Badge className="font-medium">{reason}</Badge>
                </li>
              ))}
            </ul>
          )}

          <Button variant="ghost" className="-mx-2 justify-between self-stretch" onClick={() => setDrawerOpen(true)}>
            See the platform plan
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>

          <div className="mt-auto space-y-3">
            <ResponsePanel response={response} others={others} matchId={match.match_id} compact />
            <div className="flex items-center gap-1 border-t border-border pt-3 text-sm">
              <button type="button" onClick={() => setReportOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-muted hover:bg-surface-2 hover:text-ink">
                <Flag className="h-4 w-4" aria-hidden />
                Report<span className="sr-only"> this match</span>
              </button>
              <button type="button" onClick={() => setBlockOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-muted hover:bg-surface-2 hover:text-ink">
                <Ban className="h-4 w-4" aria-hidden />
                Block<span className="sr-only"> someone in this match</span>
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <MatchDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        match={match}
        others={others}
        userId={userId}
        response={response}
        onReport={() => {
          setDrawerOpen(false);
          setReportOpen(true);
        }}
        onBlock={() => {
          setDrawerOpen(false);
          setBlockOpen(true);
        }}
        showIcebreaker={!invitation}
      />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} matchId={match.match_id} userId={userId} />
      <BlockDialog open={blockOpen} onClose={() => setBlockOpen(false)} userId={userId} names={others} />
    </motion.article>
  );
}
