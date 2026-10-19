"use client";

import { RouteError } from "@/components/shared/RouteError";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="We couldn't load the sign-up form" />;
}
