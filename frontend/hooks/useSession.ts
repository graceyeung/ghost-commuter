"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { GenderIdentity, GenderPreference, LanguageSettings, ParsedSchedule, SafetyTag } from "@/lib/api/contract";

/**
 * Local profiles. Hackathon simplification: there is no real auth. Every profile created on this
 * device (its anonymous backend user_id plus what the student entered) is kept in localStorage, and
 * "signing in" means choosing which saved profile is active. Nothing here is an address or real name.
 */
export interface SessionProfile {
  uniAffiliation: string;
  universityHub: string;
  homeStation: string;
  genderIdentity: GenderIdentity;
  genderPreference: GenderPreference;
  safetyPreferences: SafetyTag[];
  studyInterests: string[];
  commuteText: string;
}

export interface Session {
  userId: string;
  displayName: string;
  createdAt: string;
  lastUsedAt?: string;
  profile: SessionProfile | null;
  parsedSchedule: ParsedSchedule | null;
  needsClarification: string | null;
  isActive: boolean;
  /** Display names this student blocked. Matches containing them are hidden on this device. */
  blocked: string[];
  /** The student's own languages and how they're used (as last saved on the server). */
  languageSettings: LanguageSettings | null;
}

interface ProfileStore {
  activeId: string | null;
  profiles: Session[];
}

const KEY = "ghost-commuter:profiles";
const LEGACY_KEY = "ghost-commuter:session";
const EMPTY: ProfileStore = { activeId: null, profiles: [] };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedStore: ProfileStore = EMPTY;
let memoryFallback: string | null = null;

function normalise(value: Partial<Session>): Session | null {
  if (typeof value.userId !== "string" || typeof value.displayName !== "string") return null;
  return {
    userId: value.userId,
    displayName: value.displayName,
    createdAt: value.createdAt ?? new Date().toISOString(),
    lastUsedAt: value.lastUsedAt,
    profile: value.profile ?? null,
    parsedSchedule: value.parsedSchedule ?? null,
    needsClarification: value.needsClarification ?? null,
    isActive: value.isActive ?? true,
    blocked: Array.isArray(value.blocked) ? value.blocked : [],
    languageSettings: value.languageSettings ?? null,
  };
}

function readRaw(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== null) return raw;
    // One-time migration from the single-session format.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const session = normalise(JSON.parse(legacy) as Partial<Session>);
      const migrated = JSON.stringify(session ? { activeId: session.userId, profiles: [session] } : EMPTY);
      window.localStorage.setItem(KEY, migrated);
      window.localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
    return null;
  } catch {
    return memoryFallback;
  }
}

function getSnapshot(): ProfileStore {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedStore;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<ProfileStore>) : EMPTY;
    const profiles = (Array.isArray(parsed.profiles) ? parsed.profiles : [])
      .map((p) => normalise(p))
      .filter((p): p is Session => p !== null);
    const activeId = profiles.some((p) => p.userId === parsed.activeId) ? (parsed.activeId ?? null) : null;
    cachedStore = { activeId, profiles };
  } catch {
    cachedStore = EMPTY;
  }
  return cachedStore;
}

function getServerSnapshot(): ProfileStore {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(store: ProfileStore) {
  const raw = JSON.stringify(store);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Storage blocked: keep it in memory so this tab still works.
    memoryFallback = raw;
  }
  for (const listener of listeners) listener();
}

function upsert(store: ProfileStore, session: Session): Session[] {
  const others = store.profiles.filter((p) => p.userId !== session.userId);
  return [session, ...others];
}

const noopSubscribe = () => () => {};

/** Every profile saved on this device, newest-used first, plus which one is signed in. */
export function useProfiles() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const signIn = useCallback((userId: string) => {
    const current = getSnapshot();
    const profile = current.profiles.find((p) => p.userId === userId);
    if (!profile) return;
    write({ activeId: userId, profiles: upsert(current, { ...profile, lastUsedAt: new Date().toISOString() }) });
  }, []);

  /** Signs out but keeps the profile saved on this device. */
  const signOut = useCallback(() => write({ ...getSnapshot(), activeId: null }), []);

  /** Forgets a profile on this device (does not touch the server). */
  const removeProfile = useCallback((userId: string) => {
    const current = getSnapshot();
    write({
      activeId: current.activeId === userId ? null : current.activeId,
      profiles: current.profiles.filter((p) => p.userId !== userId),
    });
  }, []);

  return { profiles: store.profiles, activeId: store.activeId, ready, signIn, signOut, removeProfile };
}

export interface UseSession {
  session: Session | null;
  /** False during server render and hydration; avoid showing "not joined" until true. */
  ready: boolean;
  /** Saves (or replaces) a profile and signs in as it. */
  setSession: (session: Session) => void;
  updateSession: (patch: Partial<Omit<Session, "userId">>) => void;
  /** Signs out, keeping the profile saved on this device. */
  signOut: () => void;
  /** Removes the signed-in profile from this device. */
  forgetSession: () => void;
}

/** The signed-in profile. */
export function useSession(): UseSession {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const session = store.profiles.find((p) => p.userId === store.activeId) ?? null;

  const setSession = useCallback((next: Session) => {
    const stamped = { ...next, lastUsedAt: new Date().toISOString() };
    write({ activeId: next.userId, profiles: upsert(getSnapshot(), stamped) });
  }, []);

  const updateSession = useCallback((patch: Partial<Omit<Session, "userId">>) => {
    const current = getSnapshot();
    const active = current.profiles.find((p) => p.userId === current.activeId);
    if (!active) return;
    write({ ...current, profiles: current.profiles.map((p) => (p === active ? { ...active, ...patch } : p)) });
  }, []);

  const signOut = useCallback(() => write({ ...getSnapshot(), activeId: null }), []);

  const forgetSession = useCallback(() => {
    const current = getSnapshot();
    write({ activeId: null, profiles: current.profiles.filter((p) => p.userId !== current.activeId) });
  }, []);

  return { session, ready, setSession, updateSession, signOut, forgetSession };
}
