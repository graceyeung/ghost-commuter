import { Footprints, MapPin, TrainFront, UsersRound } from "lucide-react";
import type { Match } from "@/lib/api/contract";
import { LinePills } from "@/components/shared/LinePill";

/** Vertical "platform plan" timeline derived from assembly_instructions. Station-level only. */
export function PlatformPlan({ match }: { match: Match }) {
  const a = match.assembly_instructions;
  const steps = [
    {
      icon: MapPin,
      title: `Meet at ${match.meet_station} by ${a.meet_time}`,
      body: `Look for ${a.landmark}.`,
    },
    {
      icon: UsersRound,
      title: `Board together: ${a.carriage_position}`,
      body: "Say hi with your anonymous name. No need to share anything else.",
    },
    {
      icon: TrainFront,
      title: "Ride together",
      body: <LinePills sharedLine={match.shared_line} />,
    },
    {
      icon: Footprints,
      title: "The last stretch",
      body: a.last_mile_handoff,
    },
  ];

  return (
    <ol className="relative space-y-6">
      {steps.map((step, index) => (
        <li key={index} className="relative flex gap-4">
          {index < steps.length - 1 && <span aria-hidden className="absolute left-5 top-11 h-[calc(100%-1rem)] w-0.5 -translate-x-1/2 bg-amber/30" />}
          <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-amber/60 bg-surface text-amber-text">
            <step.icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 pt-1.5">
            <p className="font-semibold">
              <span className="sr-only">Step {index + 1}: </span>
              {step.title}
            </p>
            <div className="mt-1 text-sm text-muted">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
