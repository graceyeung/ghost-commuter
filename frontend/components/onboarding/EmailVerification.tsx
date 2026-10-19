"use client";

import { useState } from "react";
import { BadgeCheck, Mail } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { describedBy } from "@/components/ui/Field";

export interface EmailVerificationProps {
  email: string;
  onEmailChange: (email: string) => void;
  verified: boolean;
  onVerified: () => void;
  emailError?: string;
  verifiedError?: string;
}

const DEMO_CODE = "246810";

/**
 * MOCKED university-email check. Nothing is sent anywhere and the email is never stored or passed to
 * the backend; in a real build this would be a one-time code from the university domain.
 */
export function EmailVerification({ email, onEmailChange, verified, onVerified, emailError, verifiedError }: EmailVerificationProps) {
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const looksValid = /^[^\s@]+@[^\s@]+\.ac\.uk$/i.test(email.trim());

  if (verified) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-success/40 bg-success/10 p-3 text-sm font-semibold text-success">
        <BadgeCheck className="h-5 w-5" aria-hidden />
        University email verified
        <Badge tone="amber">demo: verification mocked</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-amber/50 bg-amber/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="uniEmail" className="font-semibold">
          University email
        </label>
        <Badge tone="amber">demo: verification mocked</Badge>
      </div>
      <p id="uniEmail-hint" className="text-sm text-muted">
        Only students can join. We check your university address once and never store it or show it to anyone.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="uniEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@ucl.ac.uk"
          value={email}
          onChange={(event) => {
            onEmailChange(event.target.value);
            setCodeSent(false);
          }}
          aria-invalid={Boolean(emailError) || undefined}
          aria-describedby={describedBy("uniEmail", { hint: true, error: Boolean(emailError) })}
        />
        <Button variant="secondary" onClick={() => setCodeSent(true)} disabled={!looksValid} icon={<Mail className="h-4 w-4" aria-hidden />}>
          Send code
        </Button>
      </div>
      {emailError && (
        <p id="uniEmail-error" role="alert" className="text-sm font-medium text-danger">
          {emailError}
        </p>
      )}
      {codeSent && (
        <div className="space-y-2">
          <label htmlFor="uniCode" className="block text-sm font-semibold">
            6-digit code
          </label>
          <p id="uniCode-hint" className="text-sm text-muted">
            Demo: no email is sent. Use <strong className="font-mono text-ink">{DEMO_CODE}</strong> (any 6 digits work).
          </p>
          <div className="flex gap-2">
            <Input
              id="uniCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, ""));
                setCodeError(null);
              }}
              aria-describedby={describedBy("uniCode", { hint: true, error: Boolean(codeError) })}
              aria-invalid={Boolean(codeError) || undefined}
              className="max-w-[10rem] font-mono tracking-[0.3em]"
            />
            <Button
              onClick={() => {
                if (/^\d{6}$/.test(code)) onVerified();
                else setCodeError("Enter all 6 digits.");
              }}
            >
              Verify
            </Button>
          </div>
          {codeError && (
            <p id="uniCode-error" role="alert" className="text-sm font-medium text-danger">
              {codeError}
            </p>
          )}
        </div>
      )}
      {verifiedError && !emailError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {verifiedError}
        </p>
      )}
    </div>
  );
}
