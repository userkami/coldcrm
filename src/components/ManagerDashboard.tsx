"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, ManagerAnalytics, PublicUser } from "@/lib/types";
import { describeFailure, errorMessage, readJson } from "@/lib/api-client";
import { KpiCards } from "./KpiCards";
import { StatusBreakdown } from "./StatusBreakdown";
import { AgentTable } from "./AgentTable";
import { CallsPerDayChart } from "./CallsPerDayChart";
import { LeadTable } from "./LeadTable";
import { AgentAdmin } from "./AgentAdmin";
import { LogoutButton } from "./LogoutButton";

export function ManagerDashboard({
  managerName,
  managerEmail,
}: {
  managerName: string;
  managerEmail: string;
}) {
  const [analytics, setAnalytics] = useState<ManagerAnalytics | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // The requests are plain functions rather than state-setting callbacks, so
  // the effect below can await them without setting state synchronously.
  const requestData = useCallback(async () => {
    const [a, l, u] = await Promise.all([
      fetch("/api/manager/analytics"),
      fetch("/api/manager/leads"),
      fetch("/api/manager/agents"),
    ]);
    // The analytics call is the one that has to succeed — the others only
    // populate tables. Its error is surfaced verbatim so a misconfigured
    // deployment tells the operator what to fix.
    if (!a.ok) {
      throw new Error(describeFailure(a, await readJson(a)));
    }
    const nextAnalytics = (await a.json()) as ManagerAnalytics;
    const nextLeads = l.ok ? ((await l.json()) as { leads: Lead[] }).leads : [];
    const nextUsers = u.ok ? ((await u.json()) as { users: PublicUser[] }).users : [];
    return { analytics: nextAnalytics, leads: nextLeads, users: nextUsers };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await requestData();
      setAnalytics(next.analytics);
      setLeads(next.leads);
      setUsers(next.users);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Could not reach the server."));
    } finally {
      setLoading(false);
    }
  }, [requestData]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await requestData();
        if (!active) return;
        setAnalytics(next.analytics);
        setLeads(next.leads);
        setUsers(next.users);
        setError("");
      } catch (err) {
        if (active) setError(errorMessage(err, "Could not reach the server."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [requestData]);

  async function handleEdit(lead: Lead, patch: Partial<Lead>) {
    const res = await fetch("/api/manager/lead", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, ...patch }),
    });
    if (!res.ok) {
      setError(describeFailure(res, await readJson(res)));
      return;
    }
    setError("");
    await load();
  }

  const agents = users.filter((u) => u.role === "AGENT" && u.active);

  return (
    <div className="min-h-screen bg-grid">
      <header className="sticky top-0 z-10 border-b border-edge bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{managerName}</p>
            <p className="text-xs text-ink-dim">Manager dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/manager/export?type=leads"
              className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-brand-strong hover:text-ink"
            >
              Export leads
            </a>
            <a
              href="/api/manager/export?type=calls"
              className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-brand-strong hover:text-ink"
            >
              Export calls
            </a>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"
          >
            {error}
          </p>
        ) : null}

        {loading || !analytics ? (
          <div className="card flex h-64 items-center justify-center text-sm text-ink-dim">
            Loading dashboard…
          </div>
        ) : (
          <>
            <KpiCards kpis={analytics.kpis} />

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CallsPerDayChart data={analytics.callsPerDay} />
              </div>
              <StatusBreakdown breakdown={analytics.breakdown} />
            </div>

            <AgentTable agents={analytics.agents} />

            <LeadTable leads={leads} agents={agents} onEdit={handleEdit} />

            <AgentAdmin
              users={users}
              currentEmail={managerEmail}
              onChanged={load}
            />
          </>
        )}
      </main>
    </div>
  );
}
