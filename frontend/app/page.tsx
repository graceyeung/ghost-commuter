import { ArrowRight, BookOpen, EyeOff, Footprints, Handshake, MapPinOff, MessageSquareText, ShieldCheck, TrainFront, UserRoundX } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { HeroScene } from "@/components/landing/HeroScene";
import { LandingCta } from "@/components/landing/LandingCta";

const STEPS = [
  {
    icon: MessageSquareText,
    title: "Tell us your journey home",
    body: "In your own words: “King's Cross around 9:15, Piccadilly line to Acton Town, Tuesdays and Thursdays.” We work out the rest.",
  },
  {
    icon: TrainFront,
    title: "We find people on your line",
    body: "Students leaving around the same time, getting off at your station or sharing part of your route, with your safety preferences in mind.",
  },
  {
    icon: Handshake,
    title: "Everyone says yes, then you meet on the platform",
    body: "A clear meeting point, the right carriage and a plan for the last stretch. Nothing is shared until everyone accepts.",
  },
] as const;

const NEVER = [
  { icon: UserRoundX, title: "No real names", body: "You're “Velvet Owl” or “Lunar Hare”. Your real name never appears anywhere in the app." },
  { icon: MapPinOff, title: "No home addresses", body: "Station-level locations only. We warn you if you type a postcode or street, and strip it before saving." },
  { icon: Handshake, title: "Mutual yes before any contact", body: "Contact details unlock only when every person in the match has accepted." },
  { icon: EyeOff, title: "Gender stays private", body: "Used only to respect who people are comfortable travelling with. Never shown to anyone." },
] as const;

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-10 pb-16 pt-10 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
        <div className="space-y-6">
          <p className="eyebrow">For London students heading home to Zones 3 to 5</p>
          <h1 className="text-5xl font-bold leading-[1.02] sm:text-6xl md:text-7xl">
            Never commute home <span className="text-amber-text">alone.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted sm:text-xl">
            Ghost Commuter quietly pairs you with other students on your line and departure time: someone to walk home with from the station, or a
            study carriage for the ride.
          </p>
          <LandingCta />
          <p className="text-sm text-muted">Free for students. No feeds, no profiles to scroll, no pressure to meet.</p>
        </div>
        <HeroScene />
      </section>

      <section aria-labelledby="how-heading" className="py-12">
        <h2 id="how-heading" className="text-3xl font-semibold sm:text-4xl">
          How it works
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full">
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber/15 font-display text-lg font-bold text-amber-text">
                      {index + 1}
                    </span>
                    <step.icon className="h-5 w-5 text-muted" aria-hidden />
                  </div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted">{step.body}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="types-heading" className="py-12">
        <h2 id="types-heading" className="text-3xl font-semibold sm:text-4xl">
          Two ways to travel together
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Card>
            <CardBody className="space-y-3">
              <Footprints className="h-8 w-8 text-amber-text" aria-hidden />
              <h3 className="text-2xl font-semibold">Walk-home pairs</h3>
              <p className="text-muted">
                Two students getting off at the same station. Meet on the platform, ride together, then walk the well-lit main road before going your
                separate ways.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <BookOpen className="h-8 w-8 text-amber-text" aria-hidden />
              <h3 className="text-2xl font-semibold">Study carriages</h3>
              <p className="text-muted">
                Three to five students sharing part of a line and a subject. Same carriage, same reading list, a bit of company on the late train.
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      <section aria-labelledby="never-heading" className="py-12">
        <div className="rounded-3xl border border-border bg-surface/80 p-6 sm:p-10">
          <p className="eyebrow flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Trust and safety
          </p>
          <h2 id="never-heading" className="mt-2 text-3xl font-semibold sm:text-4xl">
            What we never share
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {NEVER.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                  <item.icon className="h-5 w-5 text-amber-text" aria-hidden />
                </span>
                <span>
                  <span className="block text-lg font-semibold">{item.title}</span>
                  <span className="block text-muted">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <ButtonLink href="/safety" variant="secondary" className="mt-8">
            Read the Safety Centre
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        </div>
      </section>

      <section className="py-12 text-center">
        <h2 className="text-3xl font-semibold sm:text-4xl">Someone's waiting at the right carriage.</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">Two minutes to set up. Leave whenever you like.</p>
        <div className="mt-6 flex justify-center">
          <LandingCta />
        </div>
      </section>
    </div>
  );
}
