"use client";

import { ArrowRight, TrainFront } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { useSession } from "@/hooks/useSession";

/** Primary CTA: onboarding for new visitors, straight to matches for returning students. */
export function LandingCta() {
  const { session } = useSession();
  return (
    <div className="flex flex-wrap gap-3">
      {session ? (
        <ButtonLink href="/matches" size="lg" icon={<TrainFront className="h-5 w-5" aria-hidden />}>
          Find my commute buddies
        </ButtonLink>
      ) : (
        <ButtonLink href="/join" size="lg">
          Find my commute buddies
          <ArrowRight className="h-5 w-5" aria-hidden />
        </ButtonLink>
      )}
      <ButtonLink href="/safety" size="lg" variant="secondary">
        How we keep you safe
      </ButtonLink>
    </div>
  );
}
