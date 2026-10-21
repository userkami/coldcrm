"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, ManagerAnalytics, PublicUser } from "@/lib/types";
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

  const load = useCallback(async () => {
    try {
      const [a, l, u] = await Promise.all([
        fetch("/api/manager/analytics"),
        fetch("/api/manager/leads"),
        fetch("/api/manager/agents"),
      ]);
      if (!a.ok) {
        setError("Could not load analytics.");
        return;
      }
      setAnalytics(await a.json());
      if (l.ok) setLeads((await l.json()).leads);
      if (u.ok) setUsers((await u.json()).users);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleEdit(lead: Lead, patch: Partial<Lead>) {
    const res = await fetch("/api/manager/lead", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save that lead.");
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
