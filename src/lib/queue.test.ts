import test from "node:test";
import assert from "node:assert/strict";
import {
  isClaimable,
  isEarliestOpenClaim,
  orderCandidates,
  claimNextLead,
  logDisposition,
  releaseLead,
} from "./queue.ts";
import type { Lead } from "./types.ts";

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

test("a New lead is claimable", () => {
  assert.equal(isClaimable(makeLead({ status: "New" })), true);
});

test("a Calling lead with a fresh lock is not claimable", () => {
  const lead = makeLead({
    status: "Calling",
    lockTimestamp: new Date().toISOString(),
  });
  assert.equal(isClaimable(lead), false);
});

test("a Calling lead with an expired lock is claimable", () => {
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const lead = makeLead({ status: "Calling", lockTimestamp: stale });
  assert.equal(isClaimable(lead), true);
});

test("a Calling lead with no timestamp is claimable", () => {
  assert.equal(isClaimable(makeLead({ status: "Calling", lockTimestamp: "" })), true);
});

test("a finished lead is never claimable", () => {
  for (const status of [
    "Connected - Interested",
    "Connected - Not Interested",
    "Callback Requested",
    "No Answer",
    "Wrong Number",
  ] as const) {
    assert.equal(isClaimable(makeLead({ status })), false, status);
  }
});

test("fresh leads are ordered before stale in-progress ones", () => {
  const stale = makeLead({
    id: "stale",
    status: "Calling",
    lockTimestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  });
  const fresh = makeLead({ id: "fresh" });
  const ordered = orderCandidates([stale, fresh], Date.now(), () => 0.5);
  assert.equal(ordered[0].id, "fresh");
  assert.equal(ordered[1].id, "stale");
});

test("the earliest open claim wins", () => {
  const claims = [
    { claimId: "a", claimedAt: "2026-10-21T10:00:00.000Z" },
    { claimId: "b", claimedAt: "2026-10-21T10:00:01.000Z" },
  ];
  assert.equal(isEarliestOpenClaim(claims, "a"), true);
  assert.equal(isEarliestOpenClaim(claims, "b"), false);
});

test("a claim that does not exist never wins", () => {
  assert.equal(isEarliestOpenClaim([], "missing"), false);
});

test("claims made in the same millisecond are broken by claim id", () => {
  // Two claims landing in the same millisecond is common, not exotic. If
  // ties were not broken, both agents would believe they had won.
  const at = "2026-10-21T10:00:00.000Z";
  const claims = [
    { claimId: "aaa", claimedAt: at },
    { claimId: "bbb", claimedAt: at },
  ];
  assert.equal(isEarliestOpenClaim(claims, "aaa"), true);
  assert.equal(isEarliestOpenClaim(claims, "bbb"), false);

  // Exactly one of the two may be the winner.
  const winners = claims.filter((c) => isEarliestOpenClaim(claims, c.claimId));
  assert.equal(winners.length, 1);
});

test("a claim with an unreadable timestamp cannot win", () => {
  const claims = [
    { claimId: "aaa", claimedAt: "not-a-date" },
    { claimId: "bbb", claimedAt: "2026-10-21T10:00:00.000Z" },
  ];
  assert.equal(isEarliestOpenClaim(claims, "aaa"), false);
  assert.equal(isEarliestOpenClaim(claims, "bbb"), true);
});

test("claimNextLead returns a lead and marks it Calling", async () => {
  const leads = [makeLead({ id: "lead_a" }), makeLead({ id: "lead_b" })];
  const calls: unknown[] = [];
  const repo = {
    listLeads: async () => leads,
    getLead: async (id: string) => {
      const found = leads.find((l) => l.id === id) ?? null;
      return found;
    },
    appendClaim: async (c: unknown) => {
      calls.push(c);
    },
    closeClaim: async () => {},
    listOpenClaims: async () => calls,
    writeLock: async (id: string, patch: Record<string, string>) => {
      const found = leads.find((l) => l.id === id)!;
      Object.assign(found, patch);
    },
  } as never;

  const result = await claimNextLead(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    { settleMs: 0 },
  );

  assert.ok(result.lead, "expected a lead");
  assert.equal(result.lead.status, "Calling");
  assert.equal(result.lead.assignedTo, "agent1@co.com");
  assert.ok(result.lead.lockToken.length > 0);
});

test("claimNextLead reports an empty queue", async () => {
  const repo = {
    listLeads: async () => [],
    appendClaim: async () => {},
    closeClaim: async () => {},
    listOpenClaims: async () => [],
    getLead: async () => null,
    writeLock: async () => {},
  } as never;

  const result = await claimNextLead(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    { settleMs: 0 },
  );
  assert.equal(result.lead, null);
  assert.equal(result.reason, "empty");
});

test("claimNextLead reports a busy queue when every lead is locked", async () => {
  const locked = makeLead({
    status: "Calling",
    lockTimestamp: new Date().toISOString(),
    assignedTo: "someone@co.com",
  });
  const repo = {
    listLeads: async () => [locked],
    appendClaim: async () => {},
    closeClaim: async () => {},
    listOpenClaims: async () => [],
    getLead: async () => null,
    writeLock: async () => {},
  } as never;

  const result = await claimNextLead(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    { settleMs: 0 },
  );
  assert.equal(result.lead, null);
  assert.equal(result.reason, "busy");
});

test("logDisposition refuses a claim the agent does not hold", async () => {
  const lead = makeLead({
    id: "lead_1",
    status: "Calling",
    lockToken: "someone-elses-token",
    assignedTo: "other@co.com",
  });
  let wrote = false;
  const repo = {
    getLead: async () => lead,
    writeDisposition: async () => {
      wrote = true;
    },
    appendCallLog: async () => {},
    closeClaim: async () => {},
  } as never;

  const result = await logDisposition(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    { leadId: "lead_1", claimId: "my-token", status: "No Answer", notes: "", callbackDate: "" },
    { settleMs: 0 },
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, "stale-claim");
  assert.equal(wrote, false, "must not write over another agent's lead");
});

test("logDisposition records the outcome and clears the lock", async () => {
  const lead = makeLead({
    id: "lead_1",
    status: "Calling",
    lockToken: "my-token",
    assignedTo: "agent1@co.com",
  });
  const logged: unknown[] = [];
  const repo = {
    getLead: async (id: string) => (id === "lead_1" ? lead : null),
    listLeads: async () => [],
    writeDisposition: async (id: string, patch: Record<string, string>) => {
      Object.assign(lead, patch);
      lead.lockToken = "";
    },
    appendCallLog: async (log: unknown) => {
      logged.push(log);
    },
    closeClaim: async () => {},
    appendClaim: async () => {},
    listOpenClaims: async () => [],
    writeLock: async () => {},
  } as never;

  const result = await logDisposition(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    {
      leadId: "lead_1",
      claimId: "my-token",
      status: "Connected - Interested",
      notes: "Wants a quote",
      callbackDate: "",
    },
    { settleMs: 0 },
  );

  assert.equal(result.ok, true);
  assert.equal(lead.status, "Connected - Interested");
  assert.equal(lead.lastCalledBy, "agent1@co.com");
  assert.equal(lead.lockToken, "");
  assert.equal(logged.length, 1);
});

test("releaseLead returns a lead to the queue", async () => {
  const lead = makeLead({
    id: "lead_1",
    status: "Calling",
    lockToken: "my-token",
    assignedTo: "agent1@co.com",
  });
  const repo = {
    getLead: async () => lead,
    releaseLock: async () => {
      lead.status = "New";
      lead.lockToken = "";
      lead.assignedTo = "";
    },
    closeClaim: async () => {},
  } as never;

  const released = await releaseLead(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    "lead_1",
    "my-token",
  );

  assert.equal(released, true);
  assert.equal(lead.status, "New");
});

test("releaseLead refuses a lead held by someone else", async () => {
  const lead = makeLead({
    id: "lead_1",
    status: "Calling",
    lockToken: "other-token",
    assignedTo: "other@co.com",
  });
  const repo = {
    getLead: async () => lead,
    releaseLock: async () => {
      throw new Error("must not release someone else's lead");
    },
    closeClaim: async () => {},
  } as never;

  const released = await releaseLead(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    "lead_1",
    "my-token",
  );
  assert.equal(released, false);
});
