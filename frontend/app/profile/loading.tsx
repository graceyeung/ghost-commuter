export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 sm:px-6 sm:pt-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your profile…</span>
      <div className="h-10 w-64 max-w-full animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
      <div className="h-48 animate-pulse rounded-2xl bg-surface/70 motion-reduce:animate-none" />
      <div className="h-48 animate-pulse rounded-2xl bg-surface/70 motion-reduce:animate-none" />
    </div>
  );
}
