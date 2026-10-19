import type { Metadata } from "next";
import { MatchesDashboard } from "@/components/matches/MatchesDashboard";

export const metadata: Metadata = { title: "Your matches" };

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
      <MatchesDashboard />
    </div>
  );
}
