"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronRight, MessagesSquare } from "lucide-react";
import type { MyMatch } from "@/lib/api/contract";
import { groupMatches, phaseFor, useMyMatches } from "@/hooks/useMyMatches";
import type { Session } from "@/hooks/useSession";
import { joinNames } from "@/lib/labels";
import { LinePills } from "@/components/shared/LinePill";
import { MatchCard } from "./MatchCard";

/**
 * Invitations, matches waiting on others, and confirmed matches for the signed-in profile. Confirmed
 * matches are full cards so their drawer (journey confirmation, languages, badges) stays reachable.
 */
export function MyMatchesSection({ session, refreshKey }: { session: Session; refreshKey: number }) {
  const { state } = useMyMatchesWithKey(session.userId, refreshKey);
  if (state.status !== "ready") return null;
  const { invitations, waiting, confirmed } = groupMatches(state.matches, session.blocked);
  if (invitations.length + waiting.length + confirmed.length === 0) return null;

  return (
    <section aria-labelledby="mine-heading" className="space-y-5">
      <h2 id="mine-heading" className="text-2xl font-semibold">
        Your matches
      </h2>

      {confirmed.length > 0 && <CardGroup title="Everyone said yes: chat open" matches={confirmed} session={session} />}

      {invitations.length > 0 && <CardGroup title="Invitations for you" matches={invitations} session={session} invitation />}
      {waiting.length > 0 && <CardGroup title="Waiting for the others" matches={waiting} session={session} />}
    </section>
  );
}

/** Loads "my matches", and reloads whenever `refreshKey` changes (after each new search). */
function useMyMatchesWithKey(userId: string, refreshKey: number) {
  const result = useMyMatches(userId);
  const { refresh } = result;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void refresh();
  }, [refreshKey, refresh]);
  return result;
}

function CardGroup({ title, matches, session, invitation = false }: { title: string; matches: MyMatch[]; session: Session; invitation?: boolean }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <div className="grid gap-5 md:grid-cols-2">
        {matches.map((m, index) => (
          <MatchCard
            key={m.match_id}
            match={m}
            userId={session.userId}
            selfName={m.display_names[0] ?? session.displayName}
            index={index}
            invitation={invitation && !m.you_requested}
            initial={{ phase: phaseFor(m), members: m.members }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChatLink({ match }: { match: MyMatch }) {
  const others = match.display_names.slice(1);
  return (
    <Link
      href={`/chats/${match.match_id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface/90 p-4 hover:border-amber/60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <MessagesSquare className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {match.match_type === "walk_home_pair" ? "Walk home with " : "Study carriage with "}
          {joinNames(others)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <LinePills sharedLine={match.shared_line} />
          {match.meet_station} · {match.assembly_instructions.meet_time}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
