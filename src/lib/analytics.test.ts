import test from "node:test";
import assert from "node:assert/strict";
import {
  computeKpis,
  computeBreakdown,
  computeAgentActivity,
  computeCallsPerDay,
  isContacted,
} from "./analytics.ts";
import type { CallLog, Lead, User } from "./types.ts";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    name: "Jane Doe",
    phone: "+923001234567",
    status: "New",
    assignedTo: "",
    lockTimestamp: "",
    notes: "",
    callbackDate: "",
    lastCalledBy: "",
    lastCalledAt: "",
    company: "",
    city: "",
    source: "",
    lockToken: "",
    ...overrides,
  };
}

const now = new Date("2026-10-21T12:00:00.000Z");
const today = "2026-10-21T09:00:00.000Z";
const yesterday = "2026-10-20T09:00:00.000Z";

test("conversion rate uses contacted leads as the denominator", () => {
  const leads = [
    makeLead({ id: "a", status: "Connected - Interested" }),
    makeLead({ id: "b", status: "Connected - Not Interested" }),
    makeLead({ id: "c", status: "New" }),
    makeLead({ id: "d", status: "New" }),
  ];
  const kpis = computeKpis(leads);
  assert.equal(kpis.totalLeads, 4);
  assert.equal(kpis.contacted, 2);
  assert.equal(kpis.open, 2);
  // 1 interested out of 2 contacted = 50%, not 25% of all leads.
  assert.equal(kpis.conversionRate, 50);
});

test("an empty list does not divide by zero", () => {
  const kpis = computeKpis([]);
  assert.equal(kpis.conversionRate, 0);
  assert.equal(kpis.totalLeads, 0);
});

test("a no-answer is not counted as contacted", () => {
  assert.equal(isContacted(makeLead({ status: "No Answer" })), false);
  assert.equal(isContacted(makeLead({ status: "Wrong Number" })), false);
  assert.equal(isContacted(makeLead({ status: "Callback Requested" })), true);
  assert.equal(isContacted(makeLead({ status: "Connected - Interested" })), true);
});

test("the breakdown covers every status and sums to the total", () => {
  const leads = [
    makeLead({ id: "a", status: "New" }),
    makeLead({ id: "b", status: "New" }),
    makeLead({ id: "c", status: "Connected - Interested" }),
  ];
  const breakdown = computeBreakdown(leads);
  assert.equal(breakdown.length, 7);
  assert.equal(
    breakdown.reduce((sum, b) => sum + b.count, 0),
    leads.length,
  );
  const newEntry = breakdown.find((b) => b.status === "New");
  assert.equal(newEntry?.count, 2);
  assert.equal(Math.round(newEntry!.percentage), 67);
});

test("agent activity counts today's calls from the call log", () => {
  const users: User[] = [
    { email: "a@co.com", name: "A", pin: "1", role: "AGENT", active: true },
    { email: "b@co.com", name: "B", pin: "2", role: "AGENT", active: true },
  ];
  const logs: CallLog[] = [
    {
      timestamp: today,
      leadId: "l1",
      agentEmail: "a@co.com",
      agentName: "A",
      status: "Connected - Interested",
      notes: "",
      callbackDate: "",
    },
    {
      timestamp: today,
      leadId: "l2",
      agentEmail: "a@co.com",
      agentName: "A",
      status: "No Answer",
      notes: "",
      callbackDate: "",
    },
    {
      timestamp: yesterday,
      leadId: "l3",
      agentEmail: "a@co.com",
      agentName: "A",
      status: "Connected - Interested",
      notes: "",
      callbackDate: "",
    },
  ];

  const activity = computeAgentActivity(users, [], logs, now);
  const agentA = activity.find((a) => a.email === "a@co.com")!;
  const agentB = activity.find((a) => a.email === "b@co.com")!;

  assert.equal(agentA.callsToday, 2, "only today's calls count");
  assert.equal(agentA.connectedToday, 1);
  assert.equal(agentA.interestedToday, 1);
  assert.equal(agentB.callsToday, 0);
});

test("calls per day buckets the last seven days oldest first", () => {
  const logs: CallLog[] = [
    {
      timestamp: today,
      leadId: "l1",
      agentEmail: "a@co.com",
      agentName: "A",
      status: "Connected - Interested",
      notes: "",
      callbackDate: "",
    },
    {
      timestamp: yesterday,
      leadId: "l2",
      agentEmail: "a@co.com",
      agentName: "A",
      status: "No Answer",
      notes: "",
      callbackDate: "",
    },
  ];

  const buckets = computeCallsPerDay(logs, 7, now);
  assert.equal(buckets.length, 7);
  assert.equal(buckets.at(-1)?.calls, 1);
  assert.equal(buckets.at(-2)?.calls, 1);
  assert.equal(buckets.at(-1)?.interested, 1);
});
