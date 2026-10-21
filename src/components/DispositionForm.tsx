"use client";

import { useState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

const OUTCOMES: LeadStatus[] = LEAD_STATUSES.filter((s) => s !== "Calling");

export function DispositionForm({
  busy,
  onSubmit,
  onSkip,
}: {
  busy: boolean;
  onSubmit: (data: {
    status: LeadStatus;
    notes: string;
    callbackDate: string;
  }) => void;
  onSkip: () => void;
}) {
  const [status, setStatus] = useState<LeadStatus>("Connected - Interested");
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");

  const needsCallback = status === "Callback Requested";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSubmit({
      status,
      notes,
      callbackDate: needsCallback ? callbackDate : "",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-5">
      <div>
        <label
          htmlFor="outcome"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-dim"
        >
          Call outcome
        </label>
        <select
          id="outcome"
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus)}
        >
          {OUTCOMES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {needsCallback ? (
        <div>
          <label
            htmlFor="callback"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-dim"
          >
            Callback date &amp; time
          </label>
          <input
            id="callback"
            type="datetime-local"
            required
            className="input"
            value={callbackDate}
            onChange={(e) => setCallbackDate(e.target.value)}
          />
        </div>
      ) : null}

      <div>
        <label
          htmlFor="notes"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-dim"
        >
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          className="input resize-none"
          placeholder="What did they say? What is the next step?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="btn btn-ghost flex-1"
        >
          Skip
        </button>
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary flex-[2]"
        >
          {busy ? "Saving…" : "Save & Get Next Lead"}
        </button>
      </div>
    </form>
  );
}
