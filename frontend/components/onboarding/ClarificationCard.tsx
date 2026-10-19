"use client";

import { useState, type FormEvent } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { PiiWarning } from "@/components/shared/PiiWarning";
import { detectPii } from "@/lib/pii";

export interface ClarificationCardProps {
  question: string;
  onAnswer: (answer: string) => Promise<void>;
  error?: string | null;
}

export function ClarificationCard({ question, onAnswer, error }: ClarificationCardProps) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = detectPii(answer).length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!answer.trim() || blocked) return;
    setBusy(true);
    try {
      await onAnswer(answer.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber/40">
      <CardBody>
        <form onSubmit={submit} className="space-y-4" aria-labelledby="clarify-title">
          <div className="flex items-start gap-3">
            <MessageCircleQuestion className="mt-1 h-6 w-6 shrink-0 text-amber-text" aria-hidden />
            <div>
              <h2 id="clarify-title" className="text-xl font-semibold">
                One quick question
              </h2>
              <p className="mt-1 text-muted">We understood most of it, but need one detail before we can find good matches.</p>
            </div>
          </div>
          <p className="rounded-xl bg-surface-2 p-4 text-lg font-semibold">{question}</p>
          <div className="space-y-2">
            <label htmlFor="clarify-answer" className="block text-sm font-semibold">
              Your answer
            </label>
            <Textarea
              id="clarify-answer"
              rows={2}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="e.g. around 10pm"
              aria-describedby="clarify-pii"
              aria-invalid={blocked || undefined}
            />
            <PiiWarning id="clarify-pii" text={answer} />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" loading={busy} disabled={!answer.trim() || blocked} className="w-full sm:w-auto">
            Send answer
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
