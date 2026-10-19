"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

/** Shared body for route-segment error boundaries (error.tsx). Never shows stack traces or data. */
export function RouteError({ error, reset, title = "Something went wrong on this page" }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  useEffect(() => {
    console.error("[ghost-commuter] route error", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 pt-12 sm:px-6">
      <Card>
        <CardBody className="space-y-4" role="alert">
          <TriangleAlert className="h-8 w-8 text-danger" aria-hidden />
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted">Nothing you entered has been lost from this device. Try again, or head back home.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Go home
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
