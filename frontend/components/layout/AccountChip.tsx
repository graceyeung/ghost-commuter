"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useSession } from "@/hooks/useSession";

/** Who's signed in, linking to the profile switcher. */
export function AccountChip() {
  const { session, ready } = useSession();
  if (!ready) return <span className="inline-block h-11 w-24" aria-hidden />;

  if (!session) {
    return (
      <Link href="/signin" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink hover:bg-surface-2">
        <LogIn className="h-4 w-4" aria-hidden />
        Sign in
      </Link>
    );
  }

  const initials = session.displayName
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
      href="/signin"
      className="inline-flex min-h-11 max-w-[11rem] items-center gap-2 rounded-xl py-1 pl-1.5 pr-3 text-sm font-semibold text-ink hover:bg-surface-2"
    >
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber/20 text-xs font-bold text-amber-text">
        {initials}
      </span>
      <span className="truncate max-sm:sr-only">{session.displayName}</span>
      <span className="sr-only">(signed in, switch profile)</span>
    </Link>
  );
}
