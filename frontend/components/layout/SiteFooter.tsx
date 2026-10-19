import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-border/60 pb-24 pt-8 text-sm text-muted md:pb-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>
          In an emergency call <strong className="text-ink">999</strong>. For British Transport Police, text{" "}
          <strong className="text-ink">61016</strong> (non-emergency).
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/safety" className="font-semibold text-ink underline decoration-amber/60 underline-offset-4 hover:decoration-amber">
            Safety Centre
          </Link>
          <span>Transit details are mock data for this demo, not verified TfL information.</span>
        </p>
      </div>
    </footer>
  );
}
