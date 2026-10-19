"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Clock3, Languages, Pencil, Sparkles, X } from "lucide-react";
import { DAYS, type DayOfWeek, type ParsedSchedule, type UserLanguage } from "@/lib/api/contract";
import { DAY_LABELS, formatDays, safetyTagLabel } from "@/lib/labels";
import { LINE_NAMES, findStation } from "@/lib/stations";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, inputClasses } from "@/components/ui/Input";
import { LinePills } from "@/components/shared/LinePill";
import { StationCombobox } from "@/components/shared/StationCombobox";
import { cn } from "@/lib/cn";

export interface ScheduleSummaryProps {
  schedule: ParsedSchedule;
  /** Receives a plain-language corrected description; the parent re-submits it to the backend. */
  onSave?: (correctedDescription: string) => Promise<void>;
  error?: string | null;
  title?: string;
  /** Languages found in the commute text. Not saved until the student confirms the ones they keep. */
  detectedLanguages?: readonly UserLanguage[];
  onConfirmLanguages?: (kept: UserLanguage[]) => Promise<void>;
}

/** Stable default, so "a fresh parse came back" compares references safely. */
const NO_LANGUAGES: readonly UserLanguage[] = [];

function confidenceLabel(confidence: number): { text: string; tone: "success" | "amber" } {
  if (confidence >= 0.8) return { text: "We're confident about this", tone: "success" };
  if (confidence >= 0.5) return { text: "Mostly sure: worth a quick check", tone: "amber" };
  return { text: "We're unsure: please check this", tone: "amber" };
}

export function ScheduleSummary({
  schedule,
  onSave,
  error,
  title = "Here's what we understood",
  detectedLanguages = NO_LANGUAGES,
  onConfirmLanguages,
}: ScheduleSummaryProps) {
  const [keptLanguages, setKeptLanguages] = useState<UserLanguage[]>([...detectedLanguages]);
  const [languagesSeen, setLanguagesSeen] = useState(detectedLanguages);
  const [savingLanguages, setSavingLanguages] = useState(false);
  if (languagesSeen !== detectedLanguages) {
    // A fresh parse came back: show its languages instead.
    setLanguagesSeen(detectedLanguages);
    setKeptLanguages([...detectedLanguages]);
  }
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState(schedule.origin_station);
  const [destination, setDestination] = useState(schedule.destination_station);
  const [line, setLine] = useState(schedule.line);
  const [days, setDays] = useState<DayOfWeek[]>(schedule.days);
  const [time, setTime] = useState(schedule.window_start);
  const [localError, setLocalError] = useState<string | null>(null);
  const confidence = confidenceLabel(schedule.confidence);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const o = findStation(origin);
    const d = findStation(destination);
    if (!o || !d) return setLocalError("Choose both stations from the list.");
    if (days.length === 0) return setLocalError("Choose at least one night.");
    if (!onSave) return;
    setLocalError(null);
    setSaving(true);
    try {
      const dayText = days.map((day) => `${DAY_LABELS[day].long}s`).join(", ");
      await onSave(`I leave ${o.name} at ${time} on the ${line} line to ${d.name} on ${dayText}.`);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              From your own words
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          <Badge tone={confidence.tone}>{confidence.text}</Badge>
        </div>

        {!editing ? (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-2/70 p-4 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Your journey</dt>
                <dd className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {schedule.origin_station}
                  <ArrowRight className="h-4 w-4 text-muted" aria-label="to" />
                  {schedule.destination_station}
                </dd>
                <dd className="mt-2">
                  <LinePills sharedLine={schedule.line} />
                </dd>
              </div>
              <div className="rounded-xl bg-surface-2/70 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Nights</dt>
                <dd className="mt-1 font-semibold">{formatDays(schedule.days)}</dd>
              </div>
              <div className="rounded-xl bg-surface-2/70 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Leaving between</dt>
                <dd className="mt-1 flex items-center gap-2 font-semibold">
                  <Clock3 className="h-4 w-4 text-amber-text" aria-hidden />
                  {schedule.window_start} and {schedule.window_end}
                </dd>
              </div>
              {schedule.study_interests.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Study interests</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {schedule.study_interests.map((i) => (
                      <Badge key={i} tone="amber">
                        {i}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
              {keptLanguages.length > 0 && (
                <div className="rounded-xl border border-info/40 bg-info/5 p-4 sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-info">
                    <Languages className="h-3.5 w-3.5" aria-hidden />
                    Languages you mentioned
                  </dt>
                  <dd className="mt-1 text-sm text-muted">Not saved yet. Remove any that aren't right, then add the rest to your profile.</dd>
                  <dd className="mt-3">
                    <ul className="flex flex-wrap gap-2" aria-label="Languages found in your description">
                      {keptLanguages.map((lang) => (
                        <li key={lang.code}>
                          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-info/60 py-1 pl-3 pr-1 text-sm font-semibold text-info">
                            {lang.name}
                            <button
                              type="button"
                              onClick={() => setKeptLanguages((all) => all.filter((l) => l.code !== lang.code))}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-info/15"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Remove {lang.name}</span>
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                  {onConfirmLanguages && (
                    <dd className="mt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={savingLanguages}
                        onClick={async () => {
                          setSavingLanguages(true);
                          try {
                            await onConfirmLanguages(keptLanguages);
                          } finally {
                            setSavingLanguages(false);
                          }
                        }}
                      >
                        Add {keptLanguages.length === 1 ? "it" : "them"} to my profile
                      </Button>
                    </dd>
                  )}
                </div>
              )}
              {schedule.safety_preferences.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Safety preferences</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {schedule.safety_preferences.map((t) => (
                      <Badge key={t}>{safetyTagLabel(t)}</Badge>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            {onSave && (
              <Button variant="secondary" onClick={() => setEditing(true)} icon={<Pencil className="h-4 w-4" aria-hidden />}>
                Something's off? Edit
              </Button>
            )}
          </>
        ) : (
          <form onSubmit={save} className="space-y-4" aria-label="Edit your commute">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="edit-origin" className="block text-sm font-semibold">
                  Leaving from
                </label>
                <StationCombobox id="edit-origin" value={origin} onChange={setOrigin} />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-destination" className="block text-sm font-semibold">
                  Heading home to
                </label>
                <StationCombobox id="edit-destination" value={destination} onChange={setDestination} />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-line" className="block text-sm font-semibold">
                  Line
                </label>
                <select id="edit-line" value={line} onChange={(e) => setLine(e.target.value)} className={cn(inputClasses, "min-h-12")}>
                  {!LINE_NAMES.some((l) => l === line) && <option value={line}>{line}</option>}
                  {LINE_NAMES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-time" className="block text-sm font-semibold">
                  Usually leave at
                </label>
                <Input id="edit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
              </div>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Nights</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const checked = days.includes(day);
                  return (
                    <label
                      key={day}
                      className={cn(
                        "relative inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-3 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber",
                        checked ? "border-amber bg-amber/15 text-ink" : "border-border text-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => setDays((all) => (checked ? all.filter((d) => d !== day) : [...all, day].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))))}
                      />
                      <span aria-hidden>{DAY_LABELS[day].short}</span>
                      <span className="sr-only">{DAY_LABELS[day].long}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {(localError || error) && (
              <p role="alert" className="text-sm font-medium text-danger">
                {localError ?? error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
