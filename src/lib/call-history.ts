import type { CallLog, Lead, LeadStatus } from "./types";
import { LEAD_STATUSES } from "./types";

export type HistoryPeriod = "today" | "yesterday" | "last7" | "custom";
export interface HistoryFilters {
  from: string;
  to: string;
  outcome: LeadStatus | "";
}
export interface HistoryRow extends CallLog {
  leadName: string;
  company: string;
  phone: string;
}
export interface CallHistory {
  rows: HistoryRow[];
  summary: { calls: number; uniqueLeads: number; interested: number; callbacks: number };
  filters: HistoryFilters;
  timeZone: string;
  page: number;
  pageSize: number;
  total: number;
}

export function businessDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

export function historyFilters(params: URLSearchParams, timeZone: string, now = new Date()): HistoryFilters {
  const period = params.get("period") ?? "today";
  const today = businessDate(now, timeZone);
  const offset = (days: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  let from = today;
  let to = today;
  if (period === "yesterday") from = to = offset(-1);
  else if (period === "last7") from = offset(-6);
  else if (period === "custom") {
    from = params.get("from") ?? "";
    to = params.get("to") ?? "";
    if (!validDate(from) || !validDate(to) || from > to) {
      throw new Error("Choose a valid start and end date, with the start date first.");
    }
  } else if (period !== "today") throw new Error("Choose a valid date period.");
  const outcome = params.get("outcome") ?? "";
  if (outcome && !(LEAD_STATUSES as readonly string[]).includes(outcome)) {
    throw new Error("Choose a valid call outcome.");
  }
  return { from, to, outcome: outcome as LeadStatus | "" };
}

/** Filter by the authenticated identity before joining any lead details. */
export function buildCallHistory(logs: CallLog[], leads: Lead[], email: string, filters: HistoryFilters, timeZone: string) {
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const rows: HistoryRow[] = logs.filter((log) => {
    if (log.agentEmail !== email || !Number.isFinite(Date.parse(log.timestamp))) return false;
    const day = businessDate(new Date(log.timestamp), timeZone);
    return day >= filters.from && day <= filters.to && (!filters.outcome || log.status === filters.outcome);
  }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).map((log) => {
    const lead = byId.get(log.leadId);
    return { ...log, leadName: lead?.name ?? log.leadId, company: lead?.company ?? "", phone: lead?.phone ?? "" };
  });
  return {
    rows,
    summary: {
      calls: rows.length,
      uniqueLeads: new Set(rows.map((row) => row.leadId)).size,
      interested: rows.filter((row) => row.status === "Connected - Interested").length,
      callbacks: rows.filter((row) => row.status === "Callback Requested").length,
    },
  };
}

export function historyDateTime(value: string, timeZone: string): string {
  if (!value) return "";
  // datetime-local callback values are already business wall time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return value.replace("T", " ");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${businessDate(date, timeZone)} ${new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date)}`;
}

export function historyCsv(rows: HistoryRow[], timeZone: string): string {
  const cell = (value: string) => {
    // Prevent spreadsheet formulas from executing in exported user input.
    const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const values = [
    [`Call date/time (${timeZone})`, "Lead ID", "Lead name", "Company", "Phone", "Outcome", "Notes", `Callback date/time (${timeZone})`],
    ...rows.map((row) => [historyDateTime(row.timestamp, timeZone), row.leadId, row.leadName, row.company, row.phone, row.status, row.notes, historyDateTime(row.callbackDate, timeZone)]),
  ];
  return `\uFEFF${values.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
