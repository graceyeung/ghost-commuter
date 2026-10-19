"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { friendlyMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

export interface BlockDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  /** The other members of the match (never the requester). */
  names: string[];
}

export function BlockDialog({ open, onClose, userId, names }: BlockDialogProps) {
  const api = useApi();
  const toast = useToast();
  const { session, updateSession } = useSession();
  const [selected, setSelected] = useState<string | null>(names.length === 1 ? names[0] ?? null : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const block = async () => {
    if (!selected) return setError("Choose who to block.");
    setBusy(true);
    setError(null);
    try {
      const result = await api.blockUser({ user_id: userId, blocked_display_name: selected });
      const blocked = Array.from(new Set([...(session?.blocked ?? []), selected]));
      updateSession({ blocked });
      toast.show(
        result.delivered === "server"
          ? { tone: "success", title: `${selected} is blocked`, description: "You won't be matched with them again. They aren't told." }
          : { tone: "info", title: `${selected} is hidden on this device`, description: "Blocking isn't connected to the server in this build yet." },
      );
      onClose();
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Block someone" description="They won't be told. You won't be matched with them again.">
      <div className="space-y-5">
        {names.length > 1 ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold">Who would you like to block?</legend>
            {names.map((name) => (
              <label key={name} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 has-[:checked]:border-amber has-[:checked]:bg-amber/10">
                <input type="radio" name="block-name" checked={selected === name} onChange={() => setSelected(name)} className="h-4 w-4 accent-[rgb(var(--amber))]" />
                {name}
              </label>
            ))}
          </fieldset>
        ) : (
          <p>
            Block <strong>{names[0]}</strong>?
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" loading={busy} onClick={() => void block()} icon={<Ban className="h-4 w-4" aria-hidden />}>
            Block
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
