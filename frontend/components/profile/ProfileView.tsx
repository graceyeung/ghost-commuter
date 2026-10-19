"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Save, Trash2, Users } from "lucide-react";
import {
  GENDER_PREFERENCES,
  SAFETY_TAGS,
  type GenderPreference,
  type LanguageIn,
  type LanguageMatching,
  type SafetyTag,
  type TrustSummary,
} from "@/lib/api/contract";
import { friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";
import { GENDER_PREFERENCE_LABELS, SAFETY_TAG_LABELS } from "@/lib/labels";
import { tierProgress } from "@/lib/trust";
import { detectPii } from "@/lib/pii";
import { useSession } from "@/hooks/useSession";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { inputClasses } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { PiiWarning } from "@/components/shared/PiiWarning";
import { TagInput } from "@/components/shared/TagInput";
import { LanguageMatchingFields } from "@/components/languages/LanguageMatchingFields";
import { LanguagePicker } from "@/components/languages/LanguagePicker";
import { TrustBadge } from "@/components/trust/TrustBadge";
import { ClarificationCard } from "@/components/onboarding/ClarificationCard";
import { ScheduleSummary } from "@/components/onboarding/ScheduleSummary";
import { INTEREST_SUGGESTIONS } from "@/components/onboarding/joinSchema";
import { cn } from "@/lib/cn";

const PROPOSED_NOTE = "Saved on this device only: the server doesn't support editing this yet.";

export function ProfileView() {
  const api = useApi();
  const router = useRouter();
  const toast = useToast();
  const { session, ready, updateSession, signOut, forgetSession } = useSession();
  const profile = session?.profile ?? null;

  const [commute, setCommute] = useState(profile?.commuteText ?? "");
  const [commuteBusy, setCommuteBusy] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);
  const [safety, setSafety] = useState<SafetyTag[]>(profile?.safetyPreferences ?? []);
  const [interests, setInterests] = useState<string[]>(profile?.studyInterests ?? []);
  const [genderPref, setGenderPref] = useState<GenderPreference>(profile?.genderPreference ?? "any");
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [activeBusy, setActiveBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<LanguageIn[]>([]);
  const [languageMatching, setLanguageMatching] = useState<LanguageMatching>("prefer_shared");
  const [shareLanguages, setShareLanguages] = useState(true);
  const [languagesBusy, setLanguagesBusy] = useState(false);
  const [trust, setTrust] = useState<TrustSummary | null>(null);
  const userId = session?.userId ?? null;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    api
      .getTrust(userId)
      .then((summary) => live && setTrust(summary))
      .catch(() => live && setTrust(null));
    return () => {
      live = false;
    };
  }, [api, userId]);

  // Load the stored values into the form once the session is read from storage (after hydration).
  if (ready && session && hydratedFor !== session.userId) {
    setHydratedFor(session.userId);
    setCommute(session.profile?.commuteText ?? "");
    setSafety(session.profile?.safetyPreferences ?? []);
    setInterests(session.profile?.studyInterests ?? []);
    setGenderPref(session.profile?.genderPreference ?? "any");
    setSpoken((session.languageSettings?.languages ?? []).map(({ code, proficiency }) => ({ code, proficiency })));
    setLanguageMatching(session.languageSettings?.language_matching ?? "prefer_shared");
    setShareLanguages(session.languageSettings?.share_languages ?? true);
  }

  if (!ready) return <div className="h-64 animate-pulse rounded-2xl bg-surface/60 motion-reduce:animate-none" aria-hidden />;
  if (!session) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <h1 className="text-3xl font-semibold">You're not signed in</h1>
          <p className="text-muted">Sign in to a profile saved on this device, or create a new one. It takes about two minutes.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/signin">Sign in</ButtonLink>
            <ButtonLink href="/join" variant="secondary">
              Create a profile
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    );
  }

  const commuteBlocked = detectPii(commute).length > 0;

  const saveCommute = async (text: string) => {
    setCommuteError(null);
    setCommuteBusy(true);
    try {
      const response = await api.addSchedule(session.userId, { commute_description: text.slice(0, 1200) });
      updateSession({
        parsedSchedule: response.parsed_schedule ?? session.parsedSchedule,
        needsClarification: response.status === "needs_clarification" ? response.clarification_question ?? null : null,
        profile: profile ? { ...profile, commuteText: text.slice(0, 1200) } : profile,
      });
      setCommute(text.slice(0, 1200));
      if (response.status === "registered") toast.show({ tone: "success", title: "Commute updated" });
    } catch (error) {
      setCommuteError(friendlyMessage(error));
    } finally {
      setCommuteBusy(false);
    }
  };

  const savePreferences = async () => {
    setPrefsBusy(true);
    try {
      const result = await api.updateProfile(session.userId, { safety_preferences: safety, study_interests: interests, gender_preference: genderPref });
      if (profile) updateSession({ profile: { ...profile, safetyPreferences: safety, studyInterests: interests, genderPreference: genderPref } });
      toast.show(
        result.delivered === "server" ? { tone: "success", title: "Preferences saved" } : { tone: "info", title: "Preferences saved", description: PROPOSED_NOTE },
      );
    } catch (error) {
      toast.show({ tone: "error", title: "Couldn't save preferences", description: friendlyMessage(error) });
    } finally {
      setPrefsBusy(false);
    }
  };

  const saveLanguages = async () => {
    setLanguagesBusy(true);
    try {
      const settings = await api.updateLanguages(session.userId, { languages: spoken, language_matching: languageMatching, share_languages: shareLanguages });
      updateSession({ languageSettings: settings });
      toast.show({ tone: "success", title: "Languages saved" });
    } catch (error) {
      toast.show({ tone: "error", title: "Couldn't save your languages", description: friendlyMessage(error) });
    } finally {
      setLanguagesBusy(false);
    }
  };

  const setActive = async (isActive: boolean) => {
    setActiveBusy(true);
    try {
      const result = await api.updateProfile(session.userId, { is_active: isActive });
      updateSession({ isActive });
      toast.show({
        tone: result.delivered === "server" ? "success" : "info",
        title: isActive ? "You're visible again" : "Profile paused",
        description: result.delivered === "server" ? undefined : PROPOSED_NOTE,
      });
    } catch (error) {
      toast.show({ tone: "error", title: "Couldn't change that", description: friendlyMessage(error) });
    } finally {
      setActiveBusy(false);
    }
  };

  const deleteData = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const result = await api.deleteUser(session.userId);
      forgetSession();
      setDeleteOpen(false);
      toast.show({
        tone: "success",
        title: "Your data has been deleted",
        description: result.delivered === "server" ? undefined : "Removed from this device. Server-side deletion isn't available in this build yet.",
      });
      router.push("/");
    } catch (error) {
      setDeleteError(friendlyMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Your profile</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">{session.displayName}</h1>
        <p className="text-muted">
          This anonymous name is all other students see.
          {profile && (
            <>
              {" "}
              {profile.uniAffiliation} · from {profile.universityHub} · home station {profile.homeStation}
            </>
          )}
        </p>
      </header>

      <Card>
        <CardBody>
          <Switch
            id="is-active"
            checked={session.isActive}
            disabled={activeBusy}
            onChange={(on) => void setActive(on)}
            label="Show me in matches"
            hint={session.isActive ? "You're visible to students on your line." : "Paused: nobody will be matched with you until you switch this back on."}
          />
        </CardBody>
      </Card>

      {trust && (
        <section aria-labelledby="trust-heading" className="space-y-4">
          <h2 id="trust-heading" className="text-2xl font-semibold">
            Your trust badge
          </h2>
          <Card>
            <CardBody className="space-y-4">
              <TrustBadge journeysCompleted={trust.journeys_completed} tierLabel={trust.tier_label} size="md" />
              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-label="Progress to your next badge"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(tierProgress(trust).fraction * 100)}
                  aria-valuetext={tierProgress(trust).text}
                  className="h-2.5 overflow-hidden rounded-full bg-surface-2"
                >
                  <div className="h-full rounded-full bg-success" style={{ width: `${Math.round(tierProgress(trust).fraction * 100)}%` }} />
                </div>
                <p className="text-sm text-muted">{tierProgress(trust).text}</p>
              </div>
              <p className="text-sm text-muted">
                A journey counts when you and the people you travelled with all tap “We travelled together”. Others only ever see your badge and
                count, never when, where or with whom you travelled.
              </p>
            </CardBody>
          </Card>
        </section>
      )}

      <section aria-labelledby="commute-heading" className="space-y-4">
        <h2 id="commute-heading" className="text-2xl font-semibold">
          Your commute
        </h2>
        {session.needsClarification ? (
          <ClarificationCard question={session.needsClarification} error={commuteError} onAnswer={(answer) => saveCommute(`${commute} ${answer}`.trim())} />
        ) : (
          session.parsedSchedule && (
            <ScheduleSummary key={JSON.stringify(session.parsedSchedule)} title="What we understood" schedule={session.parsedSchedule} onSave={saveCommute} error={commuteError} />
          )
        )}
        <Card>
          <CardBody className="space-y-3">
            <label htmlFor="profile-commute" className="block font-semibold">
              Describe your commute again
            </label>
            <p id="profile-commute-hint" className="text-sm text-muted">
              Changed timetable? Write it in your own words. A time range like “between 10 and 11pm” finds more people.
            </p>
            <Textarea
              id="profile-commute"
              rows={4}
              value={commute}
              onChange={(e) => setCommute(e.target.value)}
              aria-describedby="profile-commute-hint profile-commute-pii"
              aria-invalid={commuteBlocked || undefined}
            />
            <PiiWarning id="profile-commute-pii" text={commute} />
            <Button loading={commuteBusy} disabled={commuteBlocked || commute.trim().length < 15} onClick={() => void saveCommute(commute.trim())} icon={<Save className="h-4 w-4" aria-hidden />}>
              Update my commute
            </Button>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="languages-heading" className="space-y-4">
        <h2 id="languages-heading" className="text-2xl font-semibold">
          Languages
        </h2>
        <Card>
          <CardBody className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="profile-languages" className="block font-semibold">
                Languages you speak <span className="font-normal text-muted">(optional)</span>
              </label>
              <p id="profile-languages-hint" className="text-sm text-muted">
                Before you both accept, people only see the languages you share. Nothing is ever guessed from your name or where you live.
              </p>
              <LanguagePicker id="profile-languages" value={spoken} onChange={setSpoken} describedBy="profile-languages-hint" />
            </div>
            <LanguageMatchingFields
              idPrefix="profile"
              matching={languageMatching}
              onMatchingChange={setLanguageMatching}
              share={shareLanguages}
              onShareChange={setShareLanguages}
            />
            <Button loading={languagesBusy} onClick={() => void saveLanguages()} icon={<Save className="h-4 w-4" aria-hidden />}>
              Save languages
            </Button>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="prefs-heading" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="prefs-heading" className="text-2xl font-semibold">
            Preferences
          </h2>
          <Badge tone="amber">proposed: not yet in backend</Badge>
        </div>
        <Card>
          <CardBody className="space-y-6">
            <fieldset className="space-y-2">
              <legend className="mb-2 font-semibold">Safety</legend>
              {SAFETY_TAGS.map((tag) => (
                <Switch
                  key={tag}
                  id={`profile-safety-${tag}`}
                  checked={safety.includes(tag)}
                  onChange={(on) => setSafety((all) => (on ? [...all, tag] : all.filter((t) => t !== tag)))}
                  label={SAFETY_TAG_LABELS[tag].label}
                  hint={SAFETY_TAG_LABELS[tag].hint}
                />
              ))}
            </fieldset>
            <div className="space-y-2">
              <label htmlFor="profile-interests" className="block font-semibold">
                Study interests
              </label>
              <TagInput id="profile-interests" value={interests} onChange={setInterests} suggestions={INTEREST_SUGGESTIONS} />
            </div>
            <div className="space-y-2">
              <label htmlFor="profile-gender-pref" className="block font-semibold">
                Who you'd like to travel with
              </label>
              <select
                id="profile-gender-pref"
                value={genderPref}
                onChange={(e) => setGenderPref(e.target.value as GenderPreference)}
                className={cn(inputClasses, "min-h-12")}
              >
                {GENDER_PREFERENCES.map((p) => (
                  <option key={p} value={p}>
                    {GENDER_PREFERENCE_LABELS[p].label}
                  </option>
                ))}
              </select>
            </div>
            <Button loading={prefsBusy} onClick={() => void savePreferences()} icon={<Save className="h-4 w-4" aria-hidden />}>
              Save preferences
            </Button>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="danger-heading" className="space-y-4">
        <h2 id="danger-heading" className="text-2xl font-semibold">
          Leaving
        </h2>
        <Card className="border-danger/30">
          <CardBody className="space-y-4">
            <p className="text-sm text-muted">
              Signing out keeps {session.displayName} saved on this device, so you can sign back in or switch between profiles.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ButtonLink href="/signin" variant="secondary" icon={<Users className="h-4 w-4" aria-hidden />}>
              Switch profile
            </ButtonLink>
            <Button
              variant="secondary"
              icon={<LogOut className="h-4 w-4" aria-hidden />}
              onClick={() => {
                signOut();
                router.push("/signin");
              }}
            >
              Sign out
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setDeleteOpen(true)}>
              Delete my data
            </Button>
            </div>
          </CardBody>
        </Card>
      </section>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your data?"
        description="This removes this profile, its commute, matches and chats, and forgets it on this device. It can't be undone."
      >
        <div className="space-y-4">
          <p>Anyone you're matched with will simply stop seeing you. They won't be told why.</p>
          {deleteError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {deleteError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={deleteBusy} onClick={() => void deleteData()} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
              Yes, delete everything
            </Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my profile
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
