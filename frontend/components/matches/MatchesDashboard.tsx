"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CloudMoon, Languages, PauseCircle, RefreshCw, Search, TriangleAlert } from "lucide-react";
import type { DayOfWeek, FindMatchesResponse } from "@/lib/api/contract";
import { friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";
import { DAY_LABELS, modeLabel } from "@/lib/labels";
import { useSession } from "@/hooks/useSession";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { DaySelector } from "./DaySelector";
import { MatchCard } from "./MatchCard";
import { MyMatchesSection } from "./MyMatchesSection";
import { SEEDED_PLACEHOLDER } from "@/components/account/SignInView";
import { PipelineLoader } from "./PipelineLoader";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: FindMatchesResponse; hidden: number }
  | { status: "error"; message: string };

export function MatchesDashboard() {
  const api = useApi();
  const { session, ready, updateSession } = useSession();
  const [day, setDay] = useState<DayOfWeek | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const requestId = useRef(0);
  const [searches, setSearches] = useState(0);
  const [relaxing, setRelaxing] = useState(false);

  if (!ready) {
    return <div className="h-64 animate-pulse rounded-2xl bg-surface/60 motion-reduce:animate-none" aria-hidden />;
  }
  if (!session) return <NotJoined />;

  const search = async () => {
    const id = ++requestId.current;
    setState({ status: "loading" });
    try {
      const data = await api.findMatches({ user_id: session.userId, day_of_week: day ?? undefined });
      if (id !== requestId.current) return;
      // A seeded demo student signed in by ID: learn their anonymous name (the backend lists the requester first).
      const requesterName = data.matches[0]?.display_names[0];
      if (session.displayName === SEEDED_PLACEHOLDER && requesterName) updateSession({ displayName: requesterName });
      const visible = data.matches.filter((m) => !m.display_names.some((name) => session.blocked.includes(name)));
      setState({ status: "success", data: { ...data, matches: visible }, hidden: data.matches.length - visible.length });
      setSearches((n) => n + 1);
      requestAnimationFrame(() => resultsHeading.current?.focus());
    } catch (error) {
      if (id !== requestId.current) return;
      setState({ status: "error", message: friendlyMessage(error) });
    }
  };

  const paused = !session.isActive;
  const requiresShared = session.languageSettings?.language_matching === "require_shared";

  /** From the require_shared empty state: switch to prefer_shared and search again. */
  const preferShared = async () => {
    setRelaxing(true);
    try {
      const settings = await api.updateLanguages(session.userId, { language_matching: "prefer_shared" });
      updateSession({ languageSettings: settings });
      await search();
    } catch (error) {
      setState({ status: "error", message: friendlyMessage(error) });
    } finally {
      setRelaxing(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Signed in as {session.displayName} (anonymous)</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Your commute buddies</h1>
        <p className="max-w-prose text-muted">
          We look for students leaving around the same time on your line: a walk-home partner who gets off where you do, or a quiet study carriage
          for the ride.
        </p>
      </header>

      {session.needsClarification && (
        <Card className="border-amber/40">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p>We still have one question about your commute, so matches may be less accurate.</p>
            <ButtonLink href="/join" variant="secondary" size="sm">
              Answer it
            </ButtonLink>
          </CardBody>
        </Card>
      )}

      {paused ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-amber-text" aria-hidden />
              Your profile is paused, so you won't appear in anyone's matches and we won't look for yours.
            </p>
            <ButtonLink href="/profile" variant="secondary" size="sm">
              Resume on Profile
            </ButtonLink>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-5">
            <DaySelector value={day} onChange={setDay} disabled={state.status === "loading"} />
            <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 md:static">
              <Button size="lg" className="w-full sm:w-auto" loading={state.status === "loading"} onClick={() => void search()} icon={<Search className="h-5 w-5" aria-hidden />}>
                {state.status === "loading" ? "Looking…" : "Find my commute buddies"}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <MyMatchesSection session={session} refreshKey={searches} />

      <section aria-labelledby="results-heading" aria-live="polite" aria-busy={state.status === "loading"} className="space-y-5">
        {state.status === "loading" && <PipelineLoader />}

        {state.status === "error" && (
          <Card className="border-danger/40">
            <CardBody className="space-y-4">
              <h2 id="results-heading" className="flex items-center gap-2 text-xl font-semibold">
                <TriangleAlert className="h-5 w-5 text-danger" aria-hidden />
                We couldn't finish that search
              </h2>
              <p className="text-muted">{state.message}</p>
              <Button variant="secondary" onClick={() => void search()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
                Try again
              </Button>
            </CardBody>
          </Card>
        )}

        {state.status === "success" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="results-heading" ref={resultsHeading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
                {state.data.matches.length === 0
                  ? "No matches this time"
                  : `${state.data.matches.length} ${state.data.matches.length === 1 ? "suggestion" : "suggestions"}${day ? ` for ${DAY_LABELS[day].long}` : ""}`}
              </h2>
              <Badge tone="info">{modeLabel(state.data.mode)}</Badge>
            </div>

            {state.data.matches.length === 0 ? (
              <Card>
                <CardBody className="space-y-4">
                  <CloudMoon className="h-10 w-10 text-amber-text" aria-hidden />
                  {requiresShared && (
                    <div className="space-y-3 rounded-xl border border-info/40 bg-info/10 p-4">
                      <p className="flex items-center gap-2 font-semibold">
                        <Languages className="h-5 w-5 text-info" aria-hidden />
                        You asked to only match with people who share a language.
                      </p>
                      <p>Try “Prefer a shared language” to see more people. We'll still point out shared languages when there are any.</p>
                      <Button variant="secondary" size="sm" loading={relaxing} onClick={() => void preferShared()}>
                        Switch to “Prefer a shared language”
                      </Button>
                    </div>
                  )}
                  {state.data.notes.length > 0 ? (
                    <ul className="space-y-1.5">
                      {state.data.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Nobody on your line is travelling in your window yet.</p>
                  )}
                  <p className="text-muted">
                    Try another night, or widen your departure time on{" "}
                    <Link href="/profile" className="font-semibold text-amber-text underline underline-offset-4">
                      your profile
                    </Link>{" "}
                    (for example “between 10 and 11pm” rather than an exact time). New students join every week.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  {state.data.matches.map((match, index) => (
                    <MatchCard key={match.match_id} match={match} userId={session.userId} selfName={match.display_names[0] ?? session.displayName} index={index} />
                  ))}
                </div>
                {state.data.notes.length > 0 && (
                  <details className="rounded-2xl border border-border bg-surface/70 p-4 text-sm text-muted">
                    <summary className="cursor-pointer font-semibold text-ink">Notes from the matcher</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {state.data.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
            {state.hidden > 0 && (
              <p className="text-sm text-muted">
                {state.hidden} {state.hidden === 1 ? "suggestion was" : "suggestions were"} hidden because {state.hidden === 1 ? "it includes" : "they include"} someone
                you blocked.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function NotJoined() {
  return (
    <Card>
      <CardBody className="space-y-4">
        <h1 className="text-3xl font-semibold">Sign in to see your matches</h1>
        <p className="max-w-prose text-muted">
          Pick a profile saved on this device, or create a new one. It takes about two minutes, and nobody sees your details unless you both say yes.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/signin" size="lg">
            Sign in
          </ButtonLink>
          <ButtonLink href="/join" size="lg" variant="secondary">
            Create a profile
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}
