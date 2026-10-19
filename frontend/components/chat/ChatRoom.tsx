"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Flag, Loader2, MapPin, RotateCcw, ShieldCheck } from "lucide-react";
import type { MyMatch } from "@/lib/api/contract";
import { useMyMatches } from "@/hooks/useMyMatches";
import { useChat, type LocalMessage } from "@/hooks/useChat";
import { useSession } from "@/hooks/useSession";
import { joinNames } from "@/lib/labels";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { LinePills } from "@/components/shared/LinePill";
import { PlatformPlan } from "@/components/matches/PlatformPlan";
import { ReportDialog } from "@/components/matches/ReportDialog";
import { BlockDialog } from "@/components/matches/BlockDialog";
import { ChatComposer } from "./ChatComposer";
import { cn } from "@/lib/cn";

export function ChatRoom({ matchId }: { matchId: string }) {
  const { session, ready } = useSession();
  const { state } = useMyMatches(session?.userId ?? null);

  if (!ready) return <div className="h-64 animate-pulse rounded-2xl bg-surface/60 motion-reduce:animate-none" aria-hidden />;
  if (!session) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <h1 className="text-2xl font-semibold">Sign in to open this chat</h1>
          <ButtonLink href="/signin">Sign in</ButtonLink>
        </CardBody>
      </Card>
    );
  }
  if (state.status === "loading") return <div className="h-64 animate-pulse rounded-2xl bg-surface/60 motion-reduce:animate-none" aria-hidden />;

  const match = state.status === "ready" ? state.matches.find((m) => m.match_id === matchId) : undefined;
  if (!match) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <h1 className="text-2xl font-semibold">We couldn't find this chat</h1>
          <p className="text-muted">
            {state.status === "error" ? state.message : `It isn't one of ${session.displayName}'s matches. You may be signed in as a different profile.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/chats">All chats</ButtonLink>
            <ButtonLink href="/signin" variant="secondary">
              Switch profile
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    );
  }

  return <Conversation match={match} userId={session.userId} selfName={match.display_names[0] ?? session.displayName} blocked={session.blocked} />;
}

function Conversation({ match, userId, selfName, blocked }: { match: MyMatch; userId: string; selfName: string; blocked: string[] }) {
  const { messages, status, error, send } = useChat(match.match_id, userId, selfName);
  const others = match.display_names.slice(1);
  const blockedHere = others.filter((name) => blocked.includes(name));
  const everyoneBlocked = blockedHere.length > 0 && blockedHere.length === others.length;
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const nearBottom = useRef(true);
  const group = match.match_type === "study_group";

  // Stick to the newest message unless the student has scrolled up to read.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && nearBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onScroll = () => {
      nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    };
    list.addEventListener("scroll", onScroll);
    return () => list.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex h-[calc(100dvh-12rem-env(safe-area-inset-bottom))] min-h-[26rem] flex-col gap-3 md:h-[calc(100dvh-10rem)]">
      <header className="space-y-3">
        <div className="flex items-start gap-2">
          <Link href="/chats" className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink">
            <ArrowLeft className="h-5 w-5" aria-hidden />
            <span className="sr-only">All chats</span>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{joinNames(others)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <LinePills sharedLine={match.shared_line} />
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-amber-text" aria-hidden />
                {match.meet_station} · {match.assembly_instructions.meet_time}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
            >
              <Flag className="h-5 w-5" aria-hidden />
              <span className="sr-only">Report this chat</span>
            </button>
            <button
              type="button"
              onClick={() => setBlockOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
            >
              <Ban className="h-5 w-5" aria-hidden />
              <span className="sr-only">Block someone in this chat</span>
            </button>
          </div>
        </div>
        <details className="rounded-2xl border border-border bg-surface/80 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Platform plan</summary>
          <div className="mt-4">
            <PlatformPlan match={match} />
          </div>
        </details>
      </header>

      <ol
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Messages with ${joinNames(others)}`}
        className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-bg/40 p-3 sm:p-4"
      >
        <li className="mx-auto flex max-w-sm items-start gap-2 rounded-xl bg-info/10 p-3 text-center text-xs text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
          <span>
            Only the people in this match can read this chat. Keep it to the station: addresses and phone numbers are blocked or removed.
          </span>
        </li>
        {status === "loading" && (
          <li className="flex justify-center py-6 text-muted">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden />
            <span className="sr-only">Loading messages</span>
          </li>
        )}
        {status === "ready" && messages.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">No messages yet. Say hello, or use a quick reply below.</li>
        )}
        {messages.map((message) => (
          <Bubble key={message.message_id} message={message} showName={group} onRetry={(m) => void send(m.body, m.message_id)} />
        ))}
      </ol>

      {status === "not_open" ? (
        <p className="rounded-xl border border-border bg-surface-2/60 p-3 text-sm text-muted">Chat opens once everyone in the match has accepted.</p>
      ) : (
        <div className="space-y-2">
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <ChatComposer
            onSend={(body) => void send(body)}
            disabled={everyoneBlocked}
            disabledReason={`You blocked ${joinNames(blockedHere)}, so this chat is closed for you.`}
          />
        </div>
      )}

      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} matchId={match.match_id} userId={userId} />
      <BlockDialog open={blockOpen} onClose={() => setBlockOpen(false)} userId={userId} names={others} />
    </div>
  );
}

function Bubble({ message, showName, onRetry }: { message: LocalMessage; showName: boolean; onRetry: (m: LocalMessage) => void }) {
  const time = new Date(message.sent_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <li className={cn("flex flex-col", message.mine ? "items-end" : "items-start")}>
      {!message.mine && showName && <span className="mb-1 px-1 text-xs font-semibold text-muted">{message.sender_display_name}</span>}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 leading-snug sm:max-w-[70%]",
          message.mine ? "rounded-br-md bg-amber text-on-amber" : "rounded-bl-md border border-border bg-surface-2 text-ink",
          message.delivery === "sending" && "opacity-70",
        )}
      >
        <span className="sr-only">{message.mine ? "You" : message.sender_display_name}: </span>
        {message.body}
      </div>
      <span className="mt-1 px-1 text-[0.7rem] text-muted">
        {message.delivery === "sending" ? "Sending…" : message.delivery === "failed" ? "Not sent" : time}
        {message.delivery === "failed" && (
          <Button variant="ghost" size="sm" className="ml-1 min-h-7 px-2 text-xs" onClick={() => onRetry(message)} icon={<RotateCcw className="h-3 w-3" aria-hidden />}>
            Retry
          </Button>
        )}
      </span>
    </li>
  );
}
