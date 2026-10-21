"use client";

import { useMemo, useState } from "react";
import type { Lead, LeadStatus, PublicUser } from "@/lib/types";
import { LEAD_STATUSES } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { formatPhone } from "@/lib/phone";

export function LeadTable({
  leads,
  agents,
  onEdit,
}: {
  leads: Lead[];
  agents: PublicUser[];
  onEdit: (lead: Lead, patch: Partial<Lead>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter && lead.status !== statusFilter) return false;
      if (!q) return true;
      return [lead.name, lead.phone, lead.company, lead.city, lead.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [leads, query, statusFilter]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
        <h2 className="text-sm font-semibold">
          Master lead table{" "}
          <span className="font-normal text-ink-dim">
            ({filtered.length} of {leads.length})
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input w-48"
            placeholder="Search name, phone, company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="input w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "")}
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-[32rem] overflow-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2">
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-ink-dim">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Assigned</th>
              <th className="px-3 py-2 font-medium">Last called</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-dim">
                  No leads match this filter.
                </td>
              </tr>
            ) : null}
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-b border-edge/50 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{lead.name}</p>
                  <p className="text-xs text-ink-dim">
                    {[lead.company, lead.city, lead.source]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {formatPhone(lead.phone)}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-dim">
                  {lead.assignedTo || "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-dim">
                  {lead.lastCalledAt
                    ? new Date(lead.lastCalledAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() =>
                      setEditing(editing === lead.id ? null : lead.id)
                    }
                    className="rounded-md border border-edge px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors hover:border-brand-strong hover:text-ink"
                  >
                    {editing === lead.id ? "Close" : "Edit"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <LeadEditor
          lead={
            filtered.find((l) => l.id === editing) ??
            leads.find((l) => l.id === editing)!
          }
          agents={agents}
          onCancel={() => setEditing(null)}
          onSave={async (patch) => {
            const target =
              filtered.find((l) => l.id === editing) ??
              leads.find((l) => l.id === editing);
            if (!target) return;
            await onEdit(target, patch);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LeadEditor({
  lead,
  agents,
  onSave,
  onCancel,
}: {
  lead: Lead;
  agents: PublicUser[];
  onSave: (patch: Partial<Lead>) => Promise<void>;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [assignedTo, setAssignedTo] = useState(lead.assignedTo);
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone);
  const [company, setCompany] = useState(lead.company);
  const [city, setCity] = useState(lead.city);
  const [busy, setBusy] = useState(false);

  return (
    <div className="border-t border-edge bg-surface-3/40 p-5">
      <h3 className="text-sm font-semibold">Edit {lead.name}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">
            Name
          </label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">
            Phone
          </label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">
            Company
          </label>
          <input
            className="input"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">
            City
          </label>
          <input
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">
            Status
          </label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-ink-dim">
            Assigned to
          </label>
          <select
            className="input"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.email} value={a.email}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="btn btn-ghost"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({ name, phone, company, city, status, assignedTo });
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        {status === "New" ? (
          <span className="self-center text-xs text-ink-dim">
            Saving with status “New” returns this lead to the queue.
          </span>
        ) : null}
      </div>
    </div>
  );
}
