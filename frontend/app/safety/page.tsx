import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Ban, Database, Eye, EyeOff, Flag, HeartHandshake, Phone, ShieldCheck } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Safety Centre" };

const STORED = [
  "Your anonymous name (like “Velvet Owl”), university, and the station nearest your campus.",
  "Your home station: the station, never your street, postcode or house.",
  "Your commute description, with anything that looks like an address, postcode, email or phone number removed before it's saved.",
  "The nights and times you usually travel, your line, study interests and safety preferences.",
  "Your gender, if you chose to tell us, used only to respect other students' travel preferences.",
  "A contact handle, if you gave one, kept separately and only revealed after a mutual yes.",
];

const SEEN = [
  "Your anonymous name.",
  "The station where you'd meet and the part of the route you share.",
  "Why you were matched (for example “Shared study interest: statistics”).",
  "Your contact handle, only after everyone in the match has accepted.",
];

const NEVER = ["Your real name or university email.", "Your home address or postcode.", "Your gender.", "Your full timetable: only the overlapping part of your journey is used."];

const TIPS = [
  { title: "Meet on the platform, not outside", body: "Every plan uses a staffed, lit spot inside the station. Stay in public places." },
  { title: "Trust your instincts", body: "If something feels off, you can leave at any point. You don't owe anyone an explanation." },
  { title: "Tell someone your plan", body: "Let a friend or housemate know which train you're on and when you expect to be home." },
  { title: "Keep personal details for later", body: "There's no need to share where you live. Split up at a busy, lit junction, not your front door." },
  { title: "Check in when you're home", body: "A quick “home safe” message on the thread helps everyone relax." },
];

export default function SafetyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 pt-8 sm:px-6 sm:pt-12">
      <header className="space-y-3">
        <p className="eyebrow flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Safety Centre
        </p>
        <h1 className="text-4xl font-semibold sm:text-5xl">Getting home, safely and on your terms</h1>
        <p className="max-w-prose text-lg text-muted">
          Ghost Commuter is about company, not pressure. Here's exactly what we keep, what other students see, and what to do if anything doesn't
          feel right.
        </p>
      </header>

      <section aria-labelledby="emergency-heading">
        <Card className="border-danger/40 bg-danger/5">
          <CardBody className="space-y-3">
            <h2 id="emergency-heading" className="flex items-center gap-2 text-2xl font-semibold">
              <Phone className="h-6 w-6 text-danger" aria-hidden />
              If you need help now
            </h2>
            <p className="text-lg">
              <strong>Text 61016 for non-emergency, 999 in an emergency.</strong>
            </p>
            <p className="text-muted">
              61016 reaches British Transport Police discreetly from a train or station. Tell them the line, direction, carriage number and what's
              happening.{" "}
              <a
                href="https://www.btp.police.uk/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-text underline underline-offset-4"
              >
                British Transport Police guidance<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="data-heading" className="space-y-5">
        <h2 id="data-heading" className="text-3xl font-semibold">
          Your data, in plain language
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <InfoCard icon={<Database className="h-5 w-5" aria-hidden />} title="What we store" items={STORED} />
          <InfoCard icon={<Eye className="h-5 w-5" aria-hidden />} title="What matched students see" items={SEEN} />
          <InfoCard icon={<EyeOff className="h-5 w-5" aria-hidden />} title="What we never share" items={NEVER} />
        </div>
        <p className="text-sm text-muted">
          You can pause your profile or delete your data at any time from your Profile page. In this demo build, sign-in is kept on your device
          only.
        </p>
      </section>

      <section aria-labelledby="tips-heading" className="space-y-5">
        <h2 id="tips-heading" className="flex items-center gap-2 text-3xl font-semibold">
          <HeartHandshake className="h-7 w-7 text-amber-text" aria-hidden />
          Meeting someone new
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {TIPS.map((tip) => (
            <li key={tip.title} className="rounded-2xl border border-border bg-surface/80 p-5">
              <p className="font-semibold">{tip.title}</p>
              <p className="mt-1 text-muted">{tip.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="report-heading" className="space-y-5">
        <h2 id="report-heading" className="text-3xl font-semibold">
          Reporting and blocking
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardBody className="space-y-2">
              <h3 className="flex items-center gap-2 text-xl font-semibold">
                <Flag className="h-5 w-5 text-amber-text" aria-hidden />
                Report
              </h3>
              <p className="text-muted">
                Every match card and plan has a <strong className="text-ink">Report</strong> button. Choose what happened and add detail if you want.
                Reports are private: the other person isn't told who reported them.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2">
              <h3 className="flex items-center gap-2 text-xl font-semibold">
                <Ban className="h-5 w-5 text-amber-text" aria-hidden />
                Block
              </h3>
              <p className="text-muted">
                <strong className="text-ink">Block</strong> sits right next to Report. Blocked students are removed from your suggestions and you
                won't be matched again. They aren't notified.
              </p>
            </CardBody>
          </Card>
        </div>
        <p className="text-sm text-muted">
          Note for this build: reporting and blocking are proposed backend features. Until the server supports them they're recorded on your
          device, and the app tells you when that happens.
        </p>
      </section>
    </div>
  );
}

function InfoCard({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <Card className="h-full">
      <CardBody className="space-y-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <span className="text-amber-text">{icon}</span>
          {title}
        </h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
