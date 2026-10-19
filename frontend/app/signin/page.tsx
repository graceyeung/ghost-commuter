import type { Metadata } from "next";
import { SignInView } from "@/components/account/SignInView";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
      <SignInView />
    </div>
  );
}
