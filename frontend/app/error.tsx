"use client";

import { RouteError } from "@/components/shared/RouteError";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="Something went wrong on this page" />;
}
