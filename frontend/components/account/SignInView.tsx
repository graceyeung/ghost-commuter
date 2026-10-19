"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, LogIn, TrainFront, Trash2, UserPlus } from "lucide-react";
import { env } from "@/lib/env";
import { formatDays } from "@/lib/labels";
import { useProfiles, useSession, type Session } from "@/hooks/useSession";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { LinePills } from "@/components/shared/LinePill";

export const SEEDED_PLACEHOLDER = "Seeded student";

function lastUsed(iso: string | undefined): string {
  if (!iso) return "Not used yet";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "Used just now";
  if (minutes < 60) return `Used ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Used ${hours} h ago`;
  return `Used ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function SignInView() {
  const router = useRouter();
  const toast = useToast();
  const { profiles, activeId, ready, signIn, signOut, removeProfile } = useProfiles();
  const [removing, setRemoving] = useState<Session | null>(null);

  if (!ready) return <div className="h-64 animate-pulse rounded-2xl bg-surface/60 motion-reduce:animate-none" aria-hidden />;

  const choose = (profile: Session) => {
    signIn(profile.userId);
    toast.show({ tone: "success", title: `Signed in as ${profile.displayName}` });
    router.push(profile.needsClarification ? "/join" : "/matches");
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Sign in</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Who's travelling tonight?</h1>
        <p className="max-w-prose text-muted">
          Profiles you create are saved on this device, with everything you entered. Pick one to carry on, or add another.
        </p>
      </header>

      {profiles.length === 0 ? (
        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-xl font-semibold">No profiles on this device yet</h2>
            <p className="text-muted">Create one in about two minutes. You'll get an anonymous name like “Velvet Owl”.</p>
            <ButtonLink href="/join" icon={<UserPlus className="h-4 w-4" aria-hidden />}>
              Create a profile
            </ButtonLink>
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Saved profiles">
          {profiles.map((profile) => {
            const active = profile.userId === activeId;
            const schedule = profile.parsedSchedule;
            return (
              <li key={profile.userId}>
                <Card className={active ? "h-full border-amber/60" : "h-full"}>
                  <CardBody className="flex h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold">{profile.displayName}</h2>
                        <p className="text-sm text-muted">{lastUsed(profile.lastUsedAt)}</p>
                      </div>
                      {active && (
                        <Badge tone="success">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Signed in
                        </Badge>
                      )}
                    </div>
                    <dl className="space-y-1.5 text-sm">
                      {profile.profile && (
                        <div className="flex gap-2">
                          <dt className="sr-only">University</dt>
                          <dd className="text-muted">{profile.profile.uniAffiliation}</dd>
                        </div>
                      )}
                      {schedule ? (
                        <>
                          <div className="flex items-center gap-2">
                            <dt className="sr-only">Journey</dt>
                            <dd className="flex items-center gap-1.5">
                              <TrainFront className="h-4 w-4 shrink-0 text-amber-text" aria-hidden />
                              {schedule.origin_station} → {schedule.destination_station}
                            </dd>
                          </div>
                          <div>
                            <dt className="sr-only">Line and nights</dt>
                            <dd className="flex flex-wrap items-center gap-2">
                              <LinePills sharedLine={schedule.line} />
                              <span className="text-muted">
                                {formatDays(schedule.days)} · {schedule.window_start}
                              </span>
                            </dd>
                          </div>
                        </>
                      ) : (
                        profile.profile && (
                          <div>
                            <dt className="sr-only">Home station</dt>
                            <dd className="text-muted">Home station: {profile.profile.homeStation}</dd>
                          </div>
                        )
                      )}
                      {profile.needsClarification && <dd className="text-amber-text">One question about the commute still to answer</dd>}
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button onClick={() => choose(profile)} icon={<LogIn className="h-4 w-4" aria-hidden />}>
                        {active ? "Continue" : "Sign in"}
                        <span className="sr-only"> as {profile.displayName}</span>
                      </Button>
                      <Button variant="ghost" onClick={() => setRemoving(profile)} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
                        Remove<span className="sr-only"> {profile.displayName} from this device</span>
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
          <li>
            <a
              href="/join"
              onClick={(event) => {
                // Sign out first (the current profile stays saved) so the form opens straight away.
                event.preventDefault();
                signOut();
                router.push("/join");
              }}
              className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center font-semibold text-muted hover:border-amber/60 hover:text-ink"
            >
              <UserPlus className="h-6 w-6" aria-hidden />
              Create another profile
            </a>
          </li>
        </ul>
      )}

      {!env.useMocks && <SeededSignIn />}

      <p className="max-w-prose text-sm text-muted">
        Hackathon note: there's no password. Profiles are stored in this browser only, so anyone using this device can open them. Don't use a
        shared computer.
      </p>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.displayName ?? "this profile"}?`}
        description="It will be forgotten on this device. Your matches and chats on the server stay, so you could add it back with its ID."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">To delete the data everywhere instead, sign in and use Profile → Delete my data.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (removing) {
                  removeProfile(removing.userId);
                  toast.show({ tone: "info", title: `${removing.displayName} removed from this device` });
                }
                setRemoving(null);
              }}
            >
              Remove from this device
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** Real-backend demos: sign in as a student created by seed_demo.py. */
function SeededSignIn() {
  const router = useRouter();
  const { setSession } = useSession();
  const [id, setId] = useState("");
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());

  return (
    <details className="rounded-2xl border border-dashed border-border p-4">
      <summary className="cursor-pointer font-semibold">
        <KeyRound className="mr-2 inline h-4 w-4 align-[-2px]" aria-hidden />
        Demo: add a seeded student by ID
      </summary>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          setSession({
            userId: id.trim().toLowerCase(),
            displayName: SEEDED_PLACEHOLDER,
            createdAt: new Date().toISOString(),
            profile: null,
            parsedSchedule: null,
            needsClarification: null,
            isActive: true,
            blocked: [],
            languageSettings: null,
          });
          router.push("/matches");
        }}
      >
        <label htmlFor="seed-id" className="block text-sm font-semibold">
          User ID printed by <code>seed_demo.py</code>
        </label>
        <Input id="seed-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="6b1c022f-61a5-48fe-98e3-5d00a209cc1d" className="font-mono text-sm" />
        <Button type="submit" variant="secondary" disabled={!valid}>
          Add and sign in
        </Button>
      </form>
    </details>
  );
}
