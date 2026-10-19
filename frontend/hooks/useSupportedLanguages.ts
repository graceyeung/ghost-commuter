"use client";

import { useEffect, useState } from "react";
import type { Language } from "@/lib/api/contract";
import { useApi } from "@/lib/api";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

/** The backend's supported list; the bundled copy is used until it loads (or if it can't). */
export function useSupportedLanguages(): readonly Language[] {
  const api = useApi();
  const [languages, setLanguages] = useState<readonly Language[]>(SUPPORTED_LANGUAGES);
  useEffect(() => {
    let live = true;
    api
      .listLanguages()
      .then((result) => {
        if (live) setLanguages([...result.languages].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api]);
  return languages;
}
