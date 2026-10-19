import { ButtonLink } from "@/components/ui/Button";
import { GhostMark } from "@/components/layout/GhostMark";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 pt-16 text-center sm:px-6">
      <GhostMark className="mx-auto h-16 w-16 opacity-80" />
      <h1 className="text-3xl font-semibold">This stop isn't on the map</h1>
      <p className="text-muted">The page you're looking for doesn't exist. Let's get you back on the line.</p>
      <ButtonLink href="/">Back to the start</ButtonLink>
    </div>
  );
}
