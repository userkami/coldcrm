"use client";

import { useEffect, useState } from "react";
import { describeFailure, readJson } from "@/lib/api-client";
import { historyDateTime, type CallHistory, type HistoryPeriod } from "@/lib/call-history";
import { LEAD_STATUSES } from "@/lib/types";
import { statusLabel } from "@/lib/status";

export function AgentCallHistory({ revision }: { revision: number }) {
  const [period, setPeriod] = useState<HistoryPeriod>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [outcome, setOutcome] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CallHistory | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const params = new URLSearchParams({ period, outcome, page: String(page) });
  if (period === "custom") { params.set("from", from); params.set("to", to); }
  const query = params.toString();
  const invalidRange = period === "custom" && (!from || !to || from > to);
  const pending = loadedQuery !== `${query}:${revision}:${retry}`;
  const ready = !!data && !pending && !invalidRange && !error;

  useEffect(() => {
    if (invalidRange) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/agent/history?${query}`, { signal: controller.signal, cache: "no-store" });
        const body = await readJson(res);
        if (!res.ok || !body) throw new Error(describeFailure(res, body));
        if (!controller.signal.aborted) {
          setData(body as unknown as CallHistory);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load your call history.");
      } finally {
        if (!controller.signal.aborted) setLoadedQuery(`${query}:${revision}:${retry}`);
      }
    })();
    return () => controller.abort();
  }, [query, revision, retry, invalidRange]);

  async function exportCalls() {
    if (!ready) return;
    setExporting(true);
    setExportError("");
    try {
      // Freeze the displayed dates so an export at midnight matches the table.
      const exportParams = new URLSearchParams({
        period: "custom", from: data.filters.from, to: data.filters.to,
        outcome: data.filters.outcome, format: "csv",
      });
      const res = await fetch(`/api/agent/history?${exportParams}`, { cache: "no-store" });
      if (!res.ok) throw new Error(describeFailure(res, await readJson(res)));
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-calls_${data.filters.from}_to_${data.filters.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export your calls. Please try again.");
    } finally { setExporting(false); }
  }

  return (
    <section aria-labelledby="my-call-history" className="card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="my-call-history" className="font-semibold">My Call History</h2>
          <p className="mt-1 text-xs text-ink-dim">Your saved call attempts. Skipped leads are not counted.</p>
        </div>
        <button className="btn btn-ghost" onClick={exportCalls} disabled={!ready || exporting || data.total === 0}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-ink-dim">
          <span>Date period</span>
          <select className="input" value={period} onChange={(event) => {
            const next = event.target.value as HistoryPeriod;
            setPeriod(next); setPage(1);
            if (next === "custom" && data) {
              setFrom(data.filters.from); setTo(data.filters.to);
            }
          }}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="custom">Custom Date Range</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          <span>Outcome filter</span>
          <select className="input" value={outcome} onChange={(event) => { setOutcome(event.target.value); setPage(1); }}>
            <option value="">All outcomes</option>
            {LEAD_STATUSES.filter((status) => status !== "Calling").map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
        {period === "custom" ? <>
          <label className="space-y-1 text-xs text-ink-dim"><span>Start date</span>
            <input type="date" className="input" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
          </label>
          <label className="space-y-1 text-xs text-ink-dim"><span>End date</span>
            <input type="date" className="input" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
          </label>
        </> : null}
      </div>

      {invalidRange ? <p role="alert" className="text-sm text-warn">Choose a start and end date, with the start date first.</p> :
        pending ? <p role="status" className="text-sm text-ink-dim">Loading call history…</p> :
        error ? <div role="alert" className="space-y-2 text-sm text-bad"><p>{error}</p><button className="btn btn-ghost" onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : null}
      {exportError ? <p role="alert" className="text-sm text-bad">{exportError}</p> : null}

      {ready ? <>
        <p className="text-xs text-ink-dim">{data.filters.from} to {data.filters.to} · {data.timeZone} · Export includes all matching calls.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Call history overview">
          {([
            ["Total calls", data.summary.calls], ["Unique leads", data.summary.uniqueLeads],
            ["Interested", data.summary.interested], ["Callbacks requested", data.summary.callbacks],
          ] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-edge bg-surface-3 p-3">
            <p className="text-xl font-semibold">{value}</p><p className="text-xs text-ink-dim">{label}</p>
          </div>)}
        </div>
        {data.total === 0 ? <p className="py-6 text-center text-sm text-ink-dim">No calls match these filters. Try another date range or outcome.</p> : <>
          <div className="scroll-thin overflow-x-auto rounded-lg border border-edge" role="region" aria-label="Call history table" tabIndex={0}>
            <table className="w-full min-w-[850px] text-left text-xs">
              <caption className="sr-only">Your recorded call attempts, newest first. Times in {data.timeZone}.</caption>
              <thead className="bg-surface-3 text-ink-dim"><tr>{["Call date/time", "Lead", "Company", "Phone", "Outcome", "Notes", "Callback date/time"].map((label) => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
              <tbody>{data.rows.map((row, index) => <tr key={`${row.timestamp}:${row.leadId}:${index}`} className="border-t border-edge align-top">
                <td className="whitespace-nowrap px-3 py-3">{historyDateTime(row.timestamp, data.timeZone)}</td>
                <td className="px-3 py-3">{row.leadName}</td>
                <td className="px-3 py-3">{row.company || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.phone || "—"}</td>
                <td className="px-3 py-3">{statusLabel(row.status)}</td>
                <td className="min-w-48 max-w-80 whitespace-pre-wrap break-words px-3 py-3">{row.notes || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{historyDateTime(row.callbackDate, data.timeZone) || "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-dim">
            <p>{(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total} calls</p>
            <div className="flex gap-2">
              <button className="btn btn-ghost" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</button>
              <button className="btn btn-ghost" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>Next</button>
            </div>
          </div>
        </>}
      </> : null}
    </section>
  );
}
