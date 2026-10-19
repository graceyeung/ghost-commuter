"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GhostMark } from "./GhostMark";
import { ThemeToggle } from "./ThemeToggle";
import { AccountChip } from "./AccountChip";
import { NAV_ITEMS, isActive } from "./navItems";
import { cn } from "@/lib/cn";

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-xl py-1 pr-2">
          <GhostMark />
          <span className="font-display text-lg font-semibold tracking-tight max-[380px]:sr-only">Ghost Commuter</span>
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.filter((item) => item.href !== "/").map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors",
                      active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <item.icon className={cn("h-4 w-4", active && "text-amber-text")} aria-hidden />
                    {item.label === "Safety" ? "Safety Centre" : item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <AccountChip />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
