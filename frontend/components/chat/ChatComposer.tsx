"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { detectPii } from "@/lib/pii";
import { Button } from "@/components/ui/Button";
import { PiiWarning } from "@/components/shared/PiiWarning";
import { cn } from "@/lib/cn";
import { inputClasses } from "@/components/ui/Input";

const QUICK_REPLIES = ["On my way", "I'm at the meeting point", "Running 5 min late", "Home safe ✔"] as const;

export interface ChatComposerProps {
  onSend: (body: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}

/** Message box: Enter sends, Shift+Enter adds a line. Addresses and phone numbers are blocked before sending. */
export function ChatComposer({ onSend, disabled = false, disabledReason }: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const pii = detectPii(draft).length > 0;
  const canSend = !disabled && !pii && draft.trim().length > 0;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(draft.trim().slice(0, 1000));
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  if (disabled) {
    return <p className="rounded-xl border border-border bg-surface-2/60 p-3 text-sm text-muted">{disabledReason ?? "You can't send messages here."}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Send a message">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Quick replies">
        {QUICK_REPLIES.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onSend(text)}
            className="min-h-9 shrink-0 rounded-full border border-border bg-surface px-3 text-sm text-ink hover:border-amber/60"
          >
            {text}
          </button>
        ))}
      </div>
      <PiiWarning id="chat-pii" text={draft} />
      <div className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          rows={1}
          value={draft}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message"
          aria-describedby="chat-pii chat-hint"
          aria-invalid={pii || undefined}
          className={cn(inputClasses, "max-h-32 min-h-12 flex-1 resize-none py-3 leading-snug")}
        />
        <Button type="submit" size="lg" disabled={!canSend} className="h-12 w-12 shrink-0 px-0" aria-label="Send">
          <SendHorizontal className="h-5 w-5" aria-hidden />
        </Button>
      </div>
      <p id="chat-hint" className="sr-only">
        Press Enter to send, Shift and Enter for a new line.
      </p>
    </form>
  );
}
