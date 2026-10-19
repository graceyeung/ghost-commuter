import { Languages } from "lucide-react";
import type { Language, ParticipantLanguages as ParticipantLanguagesData } from "@/lib/api/contract";
import { PROFICIENCY_LABELS } from "@/lib/languages";

/**
 * "You both speak: Bengali, English". Outlined in the info colour with a languages icon so it reads
 * differently from the neutral "why we matched" and amber study-interest chips.
 */
export function SharedLanguages({ languages, group = false }: { languages: readonly Language[]; group?: boolean }) {
  if (languages.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-info">
        <Languages className="h-4 w-4" aria-hidden />
        {group ? "You all speak:" : "You both speak:"}
      </span>
      <ul className="contents" aria-label={group ? "Languages you all speak" : "Languages you both speak"}>
        {languages.map((lang) => (
          <li key={lang.code} className="rounded-md border border-dashed border-info/60 px-2 py-0.5 text-xs font-semibold text-info">
            {lang.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** After mutual accept: each participant's languages, for those who chose to show them. */
export function ParticipantLanguagesList({ entries }: { entries: readonly ParticipantLanguagesData[] }) {
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-sm" aria-label="Languages your matches speak">
      {entries.map((entry) => (
        <li key={entry.display_name} className="flex flex-wrap items-center gap-1.5">
          <Languages className="h-4 w-4 text-info" aria-hidden />
          <span className="font-semibold">{entry.display_name} speaks</span>
          <span className="text-muted">
            {entry.languages.map((l) => `${l.name} (${PROFICIENCY_LABELS[l.proficiency].toLowerCase()})`).join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
