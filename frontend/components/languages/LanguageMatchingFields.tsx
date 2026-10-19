"use client";

import { LANGUAGE_MATCHING, type LanguageMatching } from "@/lib/api/contract";
import { LANGUAGE_MATCHING_LABELS } from "@/lib/languages";
import { Switch } from "@/components/ui/Switch";

export interface LanguageMatchingFieldsProps {
  idPrefix: string;
  matching: LanguageMatching;
  onMatchingChange: (value: LanguageMatching) => void;
  share: boolean;
  onShareChange: (value: boolean) => void;
}

/** "How much should language matter?" (three options) and "Show my languages to matches". */
export function LanguageMatchingFields({ idPrefix, matching, onMatchingChange, share, onShareChange }: LanguageMatchingFieldsProps) {
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="font-semibold">How much should language matter?</legend>
        <div className="grid gap-2">
          {LANGUAGE_MATCHING.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 has-[:checked]:border-amber has-[:checked]:bg-amber/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber"
            >
              <input
                type="radio"
                name={`${idPrefix}-language-matching`}
                value={option}
                checked={matching === option}
                onChange={() => onMatchingChange(option)}
                className="mt-1 h-4 w-4 accent-[rgb(var(--amber))]"
              />
              <span>
                <span className="block font-semibold">{LANGUAGE_MATCHING_LABELS[option].label}</span>
                <span className="block text-sm text-muted">{LANGUAGE_MATCHING_LABELS[option].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Switch
        id={`${idPrefix}-share-languages`}
        checked={share}
        disabled={matching === "off"}
        onChange={onShareChange}
        label="Show my languages to matches"
        hint={
          matching === "off"
            ? "Languages are switched off, so nobody sees them."
            : share
              ? "Before you both accept, people only see languages you share. After you both accept, they can see your full list."
              : "We'll still use your languages for matching, but nobody sees them, not even shared ones."
        }
      />
    </div>
  );
}
