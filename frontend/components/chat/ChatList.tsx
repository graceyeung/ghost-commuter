"use client";

import { MessagesSquare, RefreshCw } from "lucide-react";
import { groupMatches, useMyMatches } from "@/hooks/useMyMatches";
import { useSession } from "@/hooks/useSession";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ChatLink } from "@/components/matches/MyMatchesSection";

export function ChatList() {
  const { session, ready } = useSession();
  const { state, refresh } = useMyMatches(session?.userId ?? null);

  if (!ready) return <div className="h-64 animate-pulse rounded-2xl bg-surface/60 motion-reduce:animate-none" aria-hidden />;
  if (!session) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <h1 className="text-3xl font-semibold">Sign in to see your chats</h1>
          <ButtonLink href="/signin">Sign in</ButtonLink>
        </CardBody>
      </Card>
    );
  }

  const grouped = state.status === "ready" ? groupMatches(state.matches, session.blocked) : null;
  const waiting = grouped ? grouped.invitations.length + grouped.waiting.length : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Signed in as {session.displayName}</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Chats</h1>
        <p className="max-w-prose text-muted">A chat opens when everyone in a match says yes. Plan the meet-up here: no phone numbers or social handles needed.</p>
      </header>

      {state.status === "loading" && <div className="h-32 animate-pulse rounded-2xl bg-surface/60 motion-reduce:animate-none" aria-hidden />}

      {state.status === "error" && (
        <Card className="border-danger/40">
          <CardBody className="space-y-3" role="alert">
            <p>{state.message}</p>
            <Button variant="secondary" onClick={() => void refresh()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              Try again
            </Button>
          </CardBody>
        </Card>
      )}

      {grouped && grouped.confirmed.length > 0 && (
        <ul className="space-y-3" aria-label="Open chats">
          {grouped.confirmed.map((m) => (
            <li key={m.match_id}>
              <ChatLink match={m} />
            </li>
          ))}
        </ul>
      )}

      {grouped && grouped.confirmed.length === 0 && (
        <Card>
          <CardBody className="space-y-4">
            <MessagesSquare className="h-10 w-10 text-amber-text" aria-hidden />
            <h2 className="text-xl font-semibold">No chats yet</h2>
            <p className="text-muted">
              {waiting > 0
                ? `You have ${waiting} ${waiting === 1 ? "match" : "matches"} waiting for an answer. The chat opens once everyone accepts.`
                : "Find commute buddies and accept a match. The chat opens once everyone says yes."}
            </p>
            <ButtonLink href="/matches">Go to matches</ButtonLink>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
