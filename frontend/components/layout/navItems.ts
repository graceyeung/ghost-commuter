import { House, MessagesSquare, ShieldCheck, TrainFront, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/matches", label: "Matches", icon: TrainFront },
  { href: "/chats", label: "Chats", icon: MessagesSquare },
  { href: "/safety", label: "Safety", icon: ShieldCheck },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
