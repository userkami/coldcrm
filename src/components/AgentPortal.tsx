"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, LeadStatus } from "@/lib/types";
import { describeFailure, readJson } from "@/lib/api-client";
import { LeadCard } from "@/components/LeadCard";
import { DispositionForm } from "@/components/DispositionForm";
import { LogoutButton } from "@/components/LogoutButton";
import { AgentCallHistory } from "@/components/AgentCallHistory";

interface AgentStats {
  callsToday: number;
  interestedToday: number;
  openCallbacks: number;
}

type NextLeadResult =
  | { lead: Lead | null; reason: string | null }
  | { error: string };

export function AgentPortal({ agentName }: { agentName: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [stats, setStats] = useState<AgentStats>({
    callsToday: 0,
    interestedToday: 0,
    openCallbacks: 0,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);

  // The requests are plain functions rather than state-setting callbacks, so
  // the effect below can await them without setting state synchronously.
  const requestNextLead = useCallback(async (): Promise<NextLeadResult> => {
    const res = await fetch("/api/agent/next-lead", { method: "POST" });
    const body = await readJson(res);
    if (!res.ok) return { error: describeFailure(res, body) };
    const nextLead = (body?.lead ?? null) as Lead | null;
    const reason = typeof body?.reason === "string" ? body.reason : null;
    return { lead: nextLead, reason };
  }, []);

  const requestStats = useCallback(async (): Promise<AgentStats | null> => {
    const res = await fetch("/api/agent/stats");
    if (!res.ok) return null;
    const body = await readJson(res);
    if (!body) return null;
    return {
      callsToday: Number(body.callsToday ?? 0),
      interestedToday: Number(body.interestedToday ?? 0),
      openCallbacks: Number(body.openCallbacks ?? 0),
    };
  }, []);

  const applyNextLead = useCallback((result: NextLeadResult) => {
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError("");
    setLead(result.lead);
    setNotice(
      result.lead
        ? ""
        : result.reason === "busy"
          ? "Every lead is currently being worked by someone else. Try again in a moment."
          : "There are no leads in the queue yet.",
    );
  }, []);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      applyNextLead(await requestNextLead());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [applyNextLead, requestNextLead]);

  const refreshStats = useCallback(async () => {
    try {
      const next = await requestStats();
      if (next) setStats(next);
    } catch {
      // Stats are decorative; a failure here must not block the agent.
    }
  }, [requestStats]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [result, next] = await Promise.all([requestNextLead(), requestStats()]);
        if (!active) return;
        applyNextLead(result);
        if (next) setStats(next);
      } catch {
        if (active) setError("Could not reach the server.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyNextLead, requestNextLead, requestStats]);

  async function handleDisposition(data: {
    status: LeadStatus;
    notes: string;
    callbackDate: string;
  }) {
    if (!lead) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/agent/disposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          claimId: lead.lockToken,
          status: data.status,
          notes: data.notes,
          callbackDate: data.callbackDate,
        }),
      });
      const body = await readJson(res);

      if (res.status === 409) {
        // The lock is no longer ours: drop the card rather than overwrite
        // whoever holds it now.
        setError(describeFailure(res, body));
        setLead(null);
        void fetchNext();
        return;
      }
      if (!res.ok) {
        setError(describeFailure(res, body));
        return;
      }

      void refreshStats();
      setHistoryRevision((value) => value + 1);
      const nextLead = (body?.nextLead ?? null) as Lead | null;
      if (nextLead) {
        setError("");
        setNotice("");
        setLead(nextLead);
      } else {
        setLead(null);
        setNotice(
          body?.reason === "busy"
            ? "Queue is empty for now — all remaining leads are being worked."
            : "That was the last lead in the queue.",
        );
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (!lead) return;
    setBusy(true);
    try {
      const res = await fetch("/api/agent/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, claimId: lead.lockToken }),
      });
      if (res.status === 409) {
        setError("This lead is no longer assigned to you.");
        setLead(null);
      }
      await fetchNext();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-grid">
      <header className="sticky top-0 z-10 border-b border-edge bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{agentName}</p>
            <p className="text-xs text-ink-dim">Agent portal</p>
          </div>
          <LogoutButton />
        </div>

        <div className="mx-auto grid max-w-2xl grid-cols-3 divide-x divide-edge border-t border-edge">
          <Stat label="Calls today" value={stats.callsToday} />
          <Stat label="Interested" value={stats.interestedToday} tone="good" />
          <Stat label="Callbacks" value={stats.openCallbacks} tone="warn" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"
          >
            {error}
          </p>
        ) : null}

        {loading && !lead ? (
          <div className="card flex h-64 items-center justify-center text-sm text-ink-dim">
            Finding a lead…
          </div>
        ) : null}

        {!loading && !lead && !error ? (
          <div className="card space-y-4 p-8 text-center">
            <div className="text-3xl">✅</div>
            <p className="text-sm text-ink-dim">{notice}</p>
            <button
              onClick={fetchNext}
              className="btn btn-primary mx-auto"
            >
              Get Next Lead
            </button>
          </div>
        ) : null}

        {lead ? (
          <>
            <LeadCard lead={lead} />
            <DispositionForm
              key={`${lead.id}:${lead.lockToken}`}
              busy={busy}
              onSubmit={handleDisposition}
              onSkip={handleSkip}
            />
          </>
        ) : null}
        <AgentCallHistory revision={historyRevision} />
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn";
}) {
  const color =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : "text-ink";
  return (
    <div className="px-4 py-2.5 text-center">
      <p className={`text-lg font-semibold leading-tight ${color}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-ink-dim">{label}</p>
    </div>
  );
}
