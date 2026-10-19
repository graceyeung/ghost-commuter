import type { Metadata } from "next";
import { JoinWizard } from "@/components/onboarding/JoinWizard";

export const metadata: Metadata = { title: "Join" };

export default function JoinPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-12">
      <JoinWizard />
    </div>
  );
}
