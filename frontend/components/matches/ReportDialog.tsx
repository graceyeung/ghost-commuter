"use client";

import { useState, type FormEvent } from "react";
import { REPORT_REASONS, type ReportReason } from "@/lib/api/contract";
import { friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";
import { REPORT_REASON_LABELS } from "@/lib/labels";
import { detectPii } from "@/lib/pii";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { PiiWarning } from "@/components/shared/PiiWarning";

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  matchId: string;
  userId: string;
  onReported?: () => void;
}

export function ReportDialog({ open, onClose, matchId, userId, onReported }: ReportDialogProps) {
  const api = useApi();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = detectPii(details).length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason) return setError("Choose the reason that fits best.");
    setBusy(true);
    setError(null);
    try {
      const result = await api.reportMatch(matchId, { user_id: userId, reason, details: details.trim() || undefined });
      toast.show(
        result.delivered === "server"
          ? { tone: "success", title: "Report received", description: "Thank you. We'll review it and won't tell them who reported." }
          : { tone: "info", title: "Report saved on this device", description: "Reporting isn't connected to the server in this build yet." },
      );
      setReason(null);
      setDetails("");
      onReported?.();
      onClose();
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report a concern"
      description="Reports are private. The other students won't see who reported them."
    >
      <form onSubmit={submit} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">What happened?</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 has-[:checked]:border-amber has-[:checked]:bg-amber/10">
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-[rgb(var(--amber))]" />
              {REPORT_REASON_LABELS[r]}
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          <label htmlFor="report-details" className="block font-semibold">
            Anything you'd like to add? <span className="font-normal text-muted">(optional)</span>
          </label>
          <Textarea id="report-details" rows={3} value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} aria-describedby="report-pii" />
          <PiiWarning id="report-pii" text={details} />
        </div>
        <p className="rounded-xl bg-surface-2/70 p-3 text-sm text-muted">
          If you're in danger now, call <strong className="text-ink">999</strong>. On a train or at a station you can text British Transport Police on{" "}
          <strong className="text-ink">61016</strong>.
        </p>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy} disabled={blocked}>
            Send report
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
