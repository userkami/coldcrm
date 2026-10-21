import test from "node:test";
import assert from "node:assert/strict";
import { buildCallHistory, businessDate, historyCsv, historyDateTime, historyFilters } from "./call-history.ts";
import type { CallLog, Lead } from "./types.ts";

const timeZone = "Asia/Karachi";
const now = new Date("2026-10-22T20:00:00Z"); // Already Oct 23 in the business timezone.
const log = (overrides: Partial<CallLog> = {}): CallLog => ({
  timestamp: "2026-10-22T20:00:00Z", leadId: "lead-1", agentEmail: "agent1@company.com",
  agentName: "Agent One", status: "Connected - Interested", notes: "Saved notes", callbackDate: "", ...overrides,
});

test("presets use the business date even when UTC is still yesterday", () => {
  assert.equal(businessDate(now, timeZone), "2026-10-23");
  assert.deepEqual(historyFilters(new URLSearchParams(), timeZone, now), { from: "2026-10-23", to: "2026-10-23", outcome: "" });
  assert.equal(historyFilters(new URLSearchParams("period=yesterday"), timeZone, now).from, "2026-10-22");
  assert.equal(historyFilters(new URLSearchParams("period=last7"), timeZone, now).from, "2026-10-17");
  assert.equal(historyFilters(new URLSearchParams("period=last7"), timeZone, new Date("2026-01-02T00:00:00Z")).from, "2025-12-27");
});

test("custom ranges reject missing, reversed and impossible dates and unknown filters", () => {
  for (const query of ["period=custom", "period=custom&from=2026-02-30&to=2026-03-01", "period=custom&from=2026-10-23&to=2026-10-22", "period=unknown", "outcome=invalid"]) {
    assert.throws(() => historyFilters(new URLSearchParams(query), timeZone, now));
  }
});

test("inclusive date ranges respect local midnight at both boundaries", () => {
  const filters = { from: "2026-10-22", to: "2026-10-22", outcome: "" as const };
  const logs = ["2026-10-21T18:59:59Z", "2026-10-21T19:00:00Z", "2026-10-22T18:59:59.999Z", "2026-10-22T19:00:00Z"].map((timestamp) => log({ timestamp }));
  const result = buildCallHistory(logs, [], "agent1@company.com", filters, timeZone);
  assert.deepEqual(result.rows.map((row) => row.timestamp), [logs[2].timestamp, logs[1].timestamp]);
});

test("history isolates identity, preserves repeated attempts and uses call-log outcomes", () => {
  const logs = [log(), log({ status: "Callback Requested", timestamp: "2026-10-22T21:00:00Z" }), log({ agentEmail: "agent2@company.com", notes: "Private to agent two" }), log({ timestamp: "broken" })];
  const lead = { id: "lead-1", name: "Jane", company: "Acme", phone: "+923001234567", notes: "Changed lead notes", status: "New" } as Lead;
  const result = buildCallHistory(logs, [lead], "agent1@company.com", historyFilters(new URLSearchParams(), timeZone, now), timeZone);
  assert.deepEqual(result.summary, { calls: 2, uniqueLeads: 1, interested: 1, callbacks: 1 });
  assert.equal(result.rows[0].leadName, "Jane");
  assert.equal(result.rows[0].notes, "Saved notes");
  assert.equal(result.rows[0].status, "Callback Requested");
  assert.equal(result.rows.some((row) => row.notes.includes("Private")), false);
});

test("outcome filtering also filters summary totals and retains missing-lead calls", () => {
  const filters = historyFilters(new URLSearchParams("outcome=No+Answer"), timeZone, now);
  const result = buildCallHistory([log(), log({ leadId: "deleted-lead", status: "No Answer" })], [], "agent1@company.com", filters, timeZone);
  assert.deepEqual(result.summary, { calls: 1, uniqueLeads: 1, interested: 0, callbacks: 0 });
  assert.equal(result.rows[0].leadName, "deleted-lead");
});

test("CSV escapes notes and spreadsheet formulas and includes the business timezone", () => {
  const result = buildCallHistory([log({ notes: '=SUM(1,2)\n"quoted"', callbackDate: "2026-10-24T10:30" })], [], "agent1@company.com", historyFilters(new URLSearchParams(), timeZone, now), timeZone);
  const csv = historyCsv(result.rows, timeZone);
  assert.ok(csv.startsWith('\uFEFF"Call date/time (Asia/Karachi)"'));
  assert.ok(csv.includes('"\'=SUM(1,2)\n""quoted"""'));
  assert.ok(csv.includes('"2026-10-23 01:00:00"'));
  assert.ok(csv.includes('"2026-10-24 10:30"'));
  assert.equal(historyDateTime("", timeZone), "");
});

test("named timezones handle daylight-saving date boundaries", () => {
  assert.equal(businessDate(new Date("2026-03-08T04:59:59Z"), "America/New_York"), "2026-03-07");
  assert.equal(businessDate(new Date("2026-03-08T05:00:00Z"), "America/New_York"), "2026-03-08");
});
