"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Lock, TrainFront, UserPlus } from "lucide-react";
import {
  GENDER_IDENTITIES,
  GENDER_PREFERENCES,
  SAFETY_TAGS,
  type LanguageIn,
  type LanguageMatching,
  type LanguageSettings,
  type RegisterProfileResponse,
  type UserLanguage,
} from "@/lib/api/contract";
import { friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";
import { GENDER_IDENTITY_LABELS, GENDER_PREFERENCE_LABELS, SAFETY_TAG_LABELS, modeLabel } from "@/lib/labels";
import { languageName } from "@/lib/languages";
import { findStation } from "@/lib/stations";
import { UNIVERSITIES } from "@/lib/universities";
import { useSession, type Session } from "@/hooks/useSession";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, describedBy } from "@/components/ui/Field";
import { Input, inputClasses } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { PiiWarning } from "@/components/shared/PiiWarning";
import { StationCombobox } from "@/components/shared/StationCombobox";
import { TagInput } from "@/components/shared/TagInput";
import { LanguageMatchingFields } from "@/components/languages/LanguageMatchingFields";
import { LanguagePicker } from "@/components/languages/LanguagePicker";
import { ClarificationCard } from "./ClarificationCard";
import { EmailVerification } from "./EmailVerification";
import { ProgressSteps } from "./ProgressSteps";
import { ScheduleSummary } from "./ScheduleSummary";
import { COMMUTE_EXAMPLES, INTEREST_SUGGESTIONS, JOIN_DEFAULTS, STEP_FIELDS, joinSchema, type JoinForm } from "./joinSchema";
import { cn } from "@/lib/cn";

const STEPS = ["About you", "Your commute", "Safety and study"] as const;
const PRIMARY_SAFETY = ["well_lit", "staffed_station", "avoid_isolated_exits", "busy_carriage"] as const;

type Phase = "form" | "clarify" | "review";

function settingsFrom(languages: LanguageIn[], matching: LanguageMatching, share: boolean): LanguageSettings {
  return {
    languages: languages.map((l) => ({ ...l, name: languageName(l.code) })),
    language_matching: matching,
    share_languages: share,
  };
}

export function JoinWizard() {
  const api = useApi();
  const router = useRouter();
  const toast = useToast();
  const { session, ready, setSession, updateSession, signOut } = useSession();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("form");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastMode, setLastMode] = useState<string | null>(null);
  const [startedFresh, setStartedFresh] = useState(false);
  /** Languages the parser found in the commute text: shown back, saved only if confirmed. */
  const [detected, setDetected] = useState<UserLanguage[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const form = useForm<JoinForm>({ resolver: zodResolver(joinSchema), defaultValues: JOIN_DEFAULTS, mode: "onTouched" });
  const { register, control, handleSubmit, trigger, setValue, watch, formState } = form;
  const errors = formState.errors;
  const commuteText = watch("commuteText");
  const bio = watch("bio");

  // Move focus to the new step's heading so screen-reader and keyboard users land in the right place.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, phase]);

  const next = async () => {
    const fields = STEP_FIELDS[step];
    if (fields && (await trigger([...fields], { shouldFocus: true }))) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const applyResponse = (response: RegisterProfileResponse, base: Omit<Session, "parsedSchedule" | "needsClarification">) => {
    setLastMode(response.mode);
    setDetected(response.detected_languages);
    setSession({
      ...base,
      displayName: response.anonymous_display_name,
      parsedSchedule: response.parsed_schedule ?? null,
      needsClarification: response.status === "needs_clarification" ? response.clarification_question ?? "Could you tell us a bit more about when you travel?" : null,
    });
    setPhase(response.status === "needs_clarification" ? "clarify" : "review");
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const hub = findStation(values.universityHub)?.name ?? values.universityHub;
      const home = findStation(values.homeStation)?.name ?? values.homeStation;
      const response = await api.registerProfile({
        uni_affiliation: values.uniAffiliation.trim(),
        university_hub: hub,
        home_station: home,
        gender_identity: values.genderIdentity,
        gender_preference: values.genderPreference,
        safety_preferences: values.safetyPreferences,
        study_interests: values.studyInterests,
        bio_freetext: values.bio.trim() || undefined,
        commute_description: values.commuteText.trim(),
        languages: values.languages,
        language_matching: values.languageMatching,
        share_languages: values.shareLanguages,
      });
      applyResponse(response, {
        userId: response.user_id,
        displayName: response.anonymous_display_name,
        createdAt: new Date().toISOString(),
        isActive: true,
        blocked: [],
        languageSettings: settingsFrom(values.languages, values.languageMatching, values.shareLanguages),
        profile: {
          uniAffiliation: values.uniAffiliation.trim(),
          universityHub: hub,
          homeStation: home,
          genderIdentity: values.genderIdentity,
          genderPreference: values.genderPreference,
          safetyPreferences: values.safetyPreferences,
          studyInterests: values.studyInterests,
          commuteText: values.commuteText.trim(),
        },
      });
    } catch (error) {
      setSubmitError(friendlyMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  const resubmitCommute = async (description: string) => {
    if (!session) return;
    setSubmitError(null);
    try {
      const response = await api.addSchedule(session.userId, { commute_description: description.slice(0, 1200) });
      setLastMode(response.mode);
      setDetected(response.detected_languages);
      updateSession({
        parsedSchedule: response.parsed_schedule ?? session.parsedSchedule,
        needsClarification: response.status === "needs_clarification" ? response.clarification_question ?? null : null,
        profile: session.profile ? { ...session.profile, commuteText: description.slice(0, 1200) } : null,
      });
      setPhase(response.status === "needs_clarification" ? "clarify" : "review");
      if (response.status === "registered") toast.show({ tone: "success", title: "Got it, thanks", description: "Your commute is updated." });
    } catch (error) {
      setSubmitError(friendlyMessage(error));
    }
  };

  /** Saves the detected languages the student kept, merged with the ones they already chose. */
  const confirmLanguages = async (kept: UserLanguage[]) => {
    if (!session) return;
    const current = session.languageSettings?.languages ?? [];
    const merged = [...current, ...kept.filter((k) => !current.some((c) => c.code === k.code))];
    try {
      const settings = await api.updateLanguages(session.userId, { languages: merged.map(({ code, proficiency }) => ({ code, proficiency })) });
      updateSession({ languageSettings: settings });
      setDetected([]);
      toast.show({ tone: "success", title: kept.length ? "Languages added" : "Got it", description: kept.length ? "You can change them any time on your profile." : undefined });
    } catch (error) {
      toast.show({ tone: "error", title: "Couldn't save your languages", description: friendlyMessage(error) });
    }
  };

  // ------------------------------------------------------------ already joined on this device
  if (ready && session && phase === "form" && !startedFresh) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <h1 className="text-2xl font-semibold">You're signed in as {session.displayName}</h1>
          <p className="text-muted">
            Carry on to your matches, or create another profile. {session.displayName} stays saved on this device, and you can switch back any
            time from <strong className="text-ink">Sign in</strong>.
          </p>
          {session.needsClarification && <p className="text-amber-text">We still have one question about your commute.</p>}
          <div className="flex flex-wrap gap-2">
            {session.needsClarification ? (
              <Button onClick={() => setPhase("clarify")}>Answer the question</Button>
            ) : (
              <ButtonLink href="/matches" icon={<TrainFront className="h-4 w-4" aria-hidden />}>
                Go to my matches
              </ButtonLink>
            )}
            <Button
              variant="secondary"
              icon={<UserPlus className="h-4 w-4" aria-hidden />}
              onClick={() => {
                signOut();
                setStartedFresh(true);
              }}
            >
              Create another profile
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  // ------------------------------------------------------------- clarification and review
  if (phase !== "form" && session) {
    return (
      <div className="space-y-6">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold focus:outline-none sm:text-4xl">
            {phase === "clarify" ? "Nearly there" : `Welcome, ${session.displayName}`}
          </h1>
          <p className="mt-2 text-muted">
            {phase === "clarify"
              ? "Your anonymous name is saved. One more detail and we can start looking."
              : "This is the name other students will see. Your real name and address are never shown."}
          </p>
          {lastMode && (
            <Badge className="mt-3" tone="info">
              {modeLabel(lastMode)}
            </Badge>
          )}
        </div>
        {phase === "clarify" && session.needsClarification && (
          <ClarificationCard
            question={session.needsClarification}
            error={submitError}
            onAnswer={(answer) => resubmitCommute(`${session.profile?.commuteText ?? ""} ${answer}`.trim())}
          />
        )}
        {phase === "review" && session.parsedSchedule && (
          <>
            <ScheduleSummary
              key={JSON.stringify(session.parsedSchedule)}
              schedule={session.parsedSchedule}
              onSave={resubmitCommute}
              error={submitError}
              detectedLanguages={detected}
              onConfirmLanguages={confirmLanguages}
            />
            <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 md:static">
              <Button size="lg" className="w-full sm:w-auto" onClick={() => router.push("/matches")} icon={<TrainFront className="h-5 w-5" aria-hidden />}>
                Looks right: find my commute buddies
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------- the form
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Join Ghost Commuter</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-3xl font-semibold focus:outline-none sm:text-4xl">
          {STEPS[step]}
        </h1>
      </div>
      <ProgressSteps steps={STEPS} current={step} />

      <form onSubmit={onSubmit} noValidate aria-describedby="join-privacy">
        <Card>
          <CardBody>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                {step === 0 && (
                  <>
                    <Field id="uniAffiliation" label="University" hint="Pick one or type your own." error={errors.uniAffiliation?.message}>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested universities">
                        {UNIVERSITIES.map((u) => (
                          <button
                            key={u.short}
                            type="button"
                            onClick={() => {
                              setValue("uniAffiliation", u.name, { shouldValidate: true });
                              setValue("universityHub", u.hub, { shouldValidate: true });
                            }}
                            className={cn(
                              "min-h-10 rounded-full border px-3.5 text-sm font-semibold",
                              watch("uniAffiliation") === u.name ? "border-amber bg-amber/15 text-ink" : "border-border text-muted hover:border-amber/60 hover:text-ink",
                            )}
                          >
                            {u.short}
                          </button>
                        ))}
                      </div>
                      <Input
                        id="uniAffiliation"
                        autoComplete="organization"
                        placeholder="e.g. Birkbeck, University of London"
                        aria-invalid={Boolean(errors.uniAffiliation) || undefined}
                        aria-describedby={describedBy("uniAffiliation", { hint: true, error: Boolean(errors.uniAffiliation) })}
                        {...register("uniAffiliation")}
                      />
                    </Field>

                    <Field
                      id="universityHub"
                      label="Station nearest your campus"
                      hint="This is where most journeys start. Filled in for you if you picked a university above."
                      error={errors.universityHub?.message}
                    >
                      <Controller
                        control={control}
                        name="universityHub"
                        render={({ field }) => (
                          <StationCombobox
                            id="universityHub"
                            ref={field.ref}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            invalid={Boolean(errors.universityHub)}
                            describedBy={describedBy("universityHub", { hint: true, error: Boolean(errors.universityHub) })}
                          />
                        )}
                      />
                    </Field>

                    <EmailVerification
                      email={watch("uniEmail")}
                      onEmailChange={(email) => {
                        setValue("uniEmail", email, { shouldValidate: formState.isSubmitted || Boolean(errors.uniEmail) });
                        setValue("emailVerified", false);
                      }}
                      verified={watch("emailVerified")}
                      onVerified={() => setValue("emailVerified", true, { shouldValidate: true })}
                      emailError={errors.uniEmail?.message}
                      verifiedError={errors.emailVerified?.message}
                    />

                    <fieldset className="space-y-3">
                      <legend className="font-semibold">Who you'd like to travel with</legend>
                      <p className="text-sm text-muted">
                        Some students only feel comfortable travelling with people of a certain gender at night, and that's fine. We use this only to
                        respect everyone's choices. It's never shown on your profile or to anyone you're matched with.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {GENDER_PREFERENCES.map((pref) => (
                          <label
                            key={pref}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 has-[:checked]:border-amber has-[:checked]:bg-amber/10"
                          >
                            <input type="radio" value={pref} {...register("genderPreference")} className="mt-1 h-4 w-4 accent-[rgb(var(--amber))]" />
                            <span>
                              <span className="block font-semibold">{GENDER_PREFERENCE_LABELS[pref].label}</span>
                              <span className="block text-sm text-muted">{GENDER_PREFERENCE_LABELS[pref].hint}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <Field
                        id="genderIdentity"
                        label="Your gender"
                        optional
                        hint="Only used so other students' preferences can be respected. Never displayed."
                      >
                        <select id="genderIdentity" aria-describedby="genderIdentity-hint" className={cn(inputClasses, "min-h-12")} {...register("genderIdentity")}>
                          {GENDER_IDENTITIES.map((g) => (
                            <option key={g} value={g}>
                              {GENDER_IDENTITY_LABELS[g]}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </fieldset>
                  </>
                )}

                {step === 1 && (
                  <>
                    <Field
                      id="commuteText"
                      label="Tell us about your journey home, in your own words"
                      hint="Where you leave from, roughly what time, and which nights. Station names only: never your street or postcode."
                      error={errors.commuteText?.message}
                    >
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Example descriptions (tap to use)">
                        {COMMUTE_EXAMPLES.map((example) => (
                          <button
                            key={example.text}
                            type="button"
                            onClick={() => {
                              setValue("commuteText", example.text, { shouldValidate: true });
                              setValue("homeStation", example.home, { shouldValidate: true });
                            }}
                            className="max-w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-left text-sm text-muted hover:border-amber/60 hover:text-ink"
                          >
                            “{example.text}”
                          </button>
                        ))}
                      </div>
                      <Textarea
                        id="commuteText"
                        rows={5}
                        placeholder="e.g. I leave King's Cross around 9:15pm to head home towards Acton Town via the Piccadilly line."
                        aria-invalid={Boolean(errors.commuteText) || undefined}
                        aria-describedby={describedBy("commuteText", { hint: true, error: Boolean(errors.commuteText), extra: "commuteText-pii" })}
                        {...register("commuteText")}
                      />
                      <div className="flex justify-between gap-4 text-xs text-muted">
                        <PiiWarning id="commuteText-pii" text={commuteText} />
                        <span className="ml-auto shrink-0">{commuteText.length}/1200</span>
                      </div>
                    </Field>

                    <Field id="homeStation" label="Your home station" hint="The station you get off at. We never ask for anything more precise." error={errors.homeStation?.message}>
                      <Controller
                        control={control}
                        name="homeStation"
                        render={({ field }) => (
                          <StationCombobox
                            id="homeStation"
                            ref={field.ref}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            invalid={Boolean(errors.homeStation)}
                            describedBy={describedBy("homeStation", { hint: true, error: Boolean(errors.homeStation) })}
                          />
                        )}
                      />
                    </Field>
                  </>
                )}

                {step === 2 && (
                  <>
                    <fieldset className="space-y-3">
                      <legend className="font-semibold">What helps you feel safe getting home?</legend>
                      <p className="text-sm text-muted">Every match comes with a platform meeting point, so you never need to meet outside the station.</p>
                      <Controller
                        control={control}
                        name="safetyPreferences"
                        render={({ field }) => {
                          const toggle = (tag: (typeof SAFETY_TAGS)[number], on: boolean) =>
                            field.onChange(on ? [...field.value, tag] : field.value.filter((t) => t !== tag));
                          const extra = SAFETY_TAGS.filter((t) => !PRIMARY_SAFETY.includes(t as (typeof PRIMARY_SAFETY)[number]));
                          return (
                            <div className="space-y-2">
                              {PRIMARY_SAFETY.map((tag) => (
                                <Switch
                                  key={tag}
                                  id={`safety-${tag}`}
                                  checked={field.value.includes(tag)}
                                  onChange={(on) => toggle(tag, on)}
                                  label={SAFETY_TAG_LABELS[tag].label}
                                  hint={SAFETY_TAG_LABELS[tag].hint}
                                />
                              ))}
                              <details className="group rounded-xl">
                                <summary className="min-h-11 cursor-pointer list-none rounded-xl px-1 py-2 font-semibold text-amber-text">
                                  <span className="group-open:hidden">Show more preferences</span>
                                  <span className="hidden group-open:inline">Fewer preferences</span>
                                </summary>
                                <div className="mt-2 space-y-2">
                                  {extra.map((tag) => (
                                    <Switch
                                      key={tag}
                                      id={`safety-${tag}`}
                                      checked={field.value.includes(tag)}
                                      onChange={(on) => toggle(tag, on)}
                                      label={SAFETY_TAG_LABELS[tag].label}
                                      hint={SAFETY_TAG_LABELS[tag].hint}
                                    />
                                  ))}
                                </div>
                              </details>
                            </div>
                          );
                        }}
                      />
                    </fieldset>

                    <Field id="studyInterests" label="What are you studying, or happy to study on the train?" hint="Used for study-carriage groups. Up to 8." error={errors.studyInterests?.message}>
                      <Controller
                        control={control}
                        name="studyInterests"
                        render={({ field }) => (
                          <TagInput id="studyInterests" value={field.value} onChange={field.onChange} suggestions={INTEREST_SUGGESTIONS} describedBy="studyInterests-hint" />
                        )}
                      />
                    </Field>

                    <Field id="bio" label="Anything else about you?" optional hint="A line about your course or what you like to chat about. Shown to no one until you both accept." error={errors.bio?.message}>
                      <Textarea
                        id="bio"
                        rows={3}
                        aria-invalid={Boolean(errors.bio) || undefined}
                        aria-describedby={describedBy("bio", { hint: true, error: Boolean(errors.bio), extra: "bio-pii" })}
                        {...register("bio")}
                      />
                      <PiiWarning id="bio-pii" text={bio} />
                    </Field>

                    <fieldset className="space-y-4">
                      <legend className="font-semibold">
                        Languages you speak <span className="font-normal text-muted">(optional)</span>
                      </legend>
                      <p id="languages-hint" className="text-sm text-muted">
                        Helps you find people who share a language. We only use what you tell us here or in your own words, never guesses from
                        your name, university or station. Before you both accept, people only see languages you share.
                      </p>
                      <Controller
                        control={control}
                        name="languages"
                        render={({ field }) => <LanguagePicker id="languages" value={field.value} onChange={field.onChange} describedBy="languages-hint" />}
                      />
                      {errors.languages?.message && (
                        <p role="alert" className="text-sm font-medium text-danger">
                          {errors.languages.message}
                        </p>
                      )}
                      <LanguageMatchingFields
                        idPrefix="join"
                        matching={watch("languageMatching")}
                        onMatchingChange={(value) => setValue("languageMatching", value)}
                        share={watch("shareLanguages")}
                        onShareChange={(value) => setValue("shareLanguages", value)}
                      />
                    </fieldset>

                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {submitError && (
              <p role="alert" className="mt-6 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm font-medium text-danger">
                {submitError}
              </p>
            )}

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep((s) => s - 1)} icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              {/* Distinct keys stop React reusing the Continue button as the submit button mid-click,
                  which would submit the form from step 2 and skip step 3. */}
              {step < STEPS.length - 1 ? (
                <Button key="continue" size="lg" onClick={next} className="w-full sm:w-auto">
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button key="submit" type="submit" size="lg" loading={submitting} className="w-full sm:w-auto">
                  {submitting ? "Reading your commute…" : "Show me what you understood"}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </form>

      <p id="join-privacy" className="flex items-start gap-2 text-sm text-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        You'll get an anonymous name like “Velvet Owl”. We only keep station-level locations, and you can only chat with someone once you've both
        said yes.
      </p>
    </div>
  );
}
