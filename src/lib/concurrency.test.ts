/**
 * Concurrency tests for the locking engine.
 *
 * These are the tests that matter most: the plan's headline promise is that
 * two agents clicking "Get Next Lead" at the same moment never receive the
 * same lead. The Sheets API cannot guarantee that on its own, so the claim
 * ledger and the earliest-claim-wins reconciliation are what enforce it —
 * and these tests exercise exactly that path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { claimNextLead, logDisposition } from "./queue.ts";
import { MemoryRepository } from "./repo/memory.ts";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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

async function tempRepo(leads: Lead[]): Promise<MemoryRepository> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-race-"));
  const file = path.join(dir, "db.json");
  const repo = new MemoryRepository(file);
  await repo.upsertUser({
    email: "agent1@co.com",
    name: "Agent One",
    pin: "1111",
    role: "AGENT",
    active: true,
  });
  await repo.upsertUser({
    email: "agent2@co.com",
    name: "Agent Two",
    pin: "2222",
    role: "AGENT",
    active: true,
  });
  // Seed the leads through the same file the repository reads from.
  const seed = new MemoryRepository(file);
  const db = JSON.parse(await fs.readFile(file, "utf8"));
  db.leads = leads;
  await fs.writeFile(file, JSON.stringify(db, null, 2), "utf8");
  void seed;
  return new MemoryRepository(file);
}

test("two agents claiming at once receive different leads", async () => {
  const leads = [
    makeLead({ id: "lead_a" }),
    makeLead({ id: "lead_b" }),
    makeLead({ id: "lead_c" }),
  ];
  const repo = await tempRepo(leads);

  const [first, second] = await Promise.all([
    claimNextLead(repo, { email: "agent1@co.com", name: "Agent One" }, { settleMs: 40 }),
    claimNextLead(repo, { email: "agent2@co.com", name: "Agent Two" }, { settleMs: 40 }),
  ]);

  assert.ok(first.lead, "agent one should get a lead");
  assert.ok(second.lead, "agent two should get a lead");
  assert.notEqual(
    first.lead.id,
    second.lead.id,
    "two agents must never receive the same lead",
  );
});

test("many agents racing a small pool never collide", async () => {
  const leads = Array.from({ length: 6 }, (_, i) =>
    makeLead({ id: `lead_${i}` }),
  );
  const repo = await tempRepo(leads);

  const emails = [
    "agent1@co.com",
    "agent2@co.com",
    "agent3@co.com",
    "agent4@co.com",
  ];

  const results = await Promise.all(
    emails.map((email) =>
      claimNextLead(repo, { email, name: email }, { settleMs: 40 }),
    ),
  );

  const claimed = results.map((r) => r.lead?.id).filter(Boolean);
  assert.equal(
    new Set(claimed).size,
    claimed.length,
    "no two claims may land on the same lead",
  );
});

/**
 * A repository that lets both agents read the queue before either writes.
 *
 * Without this, the second agent would arrive after the first has already
 * locked the lead and would simply find an empty queue — which is a correct
 * outcome, but it never exercises the race. The barrier forces the case the
 * design exists for: two agents who both saw the lead as available.
 */
function barrierRepo(inner: MemoryRepository, barriering = 2) {
  let arrived = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  // The repository's methods live on its prototype, so they are bound
  // explicitly rather than spread.
  const wrapped = {
    listLeads: async () => {
      const leads = await inner.listLeads();
      arrived += 1;
      if (arrived >= barriering) release();
      await gate;
      // Every agent sees the queue as it was before anyone locked anything.
      return leads.map((l) => ({ ...l }));
    },
    getLead: (id: string) => inner.getLead(id),
    appendClaim: (claim: never) => inner.appendClaim(claim),
    closeClaim: (id: string, outcome: string, closedAt: string) =>
      inner.closeClaim(id, outcome, closedAt),
    listOpenClaims: (leadId?: string) => inner.listOpenClaims(leadId),
    writeLock: (id: string, patch: never) => inner.writeLock(id, patch),
    writeDisposition: (id: string, patch: never) => inner.writeDisposition(id, patch),
    releaseLock: (id: string) => inner.releaseLock(id),
    updateLead: (id: string, patch: never) => inner.updateLead(id, patch),
    appendCallLog: (log: never) => inner.appendCallLog(log),
    listCallLogs: () => inner.listCallLogs(),
    listUsers: () => inner.listUsers(),
    getUser: (email: string) => inner.getUser(email),
    upsertUser: (user: never) => inner.upsertUser(user),
    removeUser: (email: string) => inner.removeUser(email),
  };

  return wrapped as unknown as MemoryRepository;
}

test("two agents who both see the lead: one wins, the loser is recorded as lost", async () => {
  const leads = [makeLead({ id: "only_one" })];
  const inner = await tempRepo(leads);
  const repo = barrierRepo(inner);

  const [first, second] = await Promise.all([
    claimNextLead(repo, { email: "agent1@co.com", name: "Agent One" }, { settleMs: 80 }),
    claimNextLead(repo, { email: "agent2@co.com", name: "Agent Two" }, { settleMs: 80 }),
  ]);

  const winners = [first, second].filter((r) => r.lead);
  assert.equal(winners.length, 1, "exactly one agent may hold the only lead");

  const claims = await inner.listClaims();
  assert.equal(claims.length, 2, "both agents appended a claim");
  const lost = claims.filter((c) => c.outcome === "lost");
  assert.equal(lost.length, 1, "the losing claim is recorded as lost");
  assert.equal(
    claims.filter((c) => c.outcome === "completed").length,
    0,
    "a lost claim is not completed",
  );
});

test("an agent arriving after the lock finds a busy queue and never claims", async () => {
  const leads = [makeLead({ id: "only_one" })];
  const repo = await tempRepo(leads);

  // The first agent takes the lead and finishes with it.
  const first = await claimNextLead(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    { settleMs: 0 },
  );
  assert.ok(first.lead);

  // The second agent arrives afterwards and finds nothing claimable.
  const second = await claimNextLead(
    repo,
    { email: "agent2@co.com", name: "Agent Two" },
    { settleMs: 0 },
  );
  assert.equal(second.lead, null);
  assert.equal(second.reason, "busy");

  const claims = await repo.listClaims();
  assert.equal(
    claims.filter((c) => c.agentEmail === "agent2@co.com").length,
    0,
    "the second agent never wrote a claim at all",
  );
});

test("a stale claim cannot overwrite the current holder's outcome", async () => {
  const lead = makeLead({
    id: "lead_1",
    status: "Calling",
    lockToken: "current-holder-token",
    assignedTo: "agent2@co.com",
  });
  const repo = await tempRepo([lead]);

  const result = await logDisposition(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    {
      leadId: "lead_1",
      claimId: "agent1-stale-token",
      status: "No Answer",
      notes: "wrong owner",
      callbackDate: "",
    },
    { settleMs: 0 },
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, "stale-claim");

  const after = await repo.getLead("lead_1");
  assert.equal(after?.status, "Calling", "status must be unchanged");
  assert.equal(after?.lastCalledBy, "", "no call may be logged");
});

test("an expired lock makes an abandoned lead claimable again", async () => {
  const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const lead = makeLead({
    id: "lead_1",
    status: "Calling",
    lockTimestamp: stale,
    assignedTo: "gone@co.com",
    lockToken: "old-token",
  });
  const repo = await tempRepo([lead]);

  const result = await claimNextLead(
    repo,
    { email: "agent1@co.com", name: "Agent One" },
    { settleMs: 0 },
  );

  assert.ok(result.lead, "an expired lock should be reclaimable");
  assert.equal(result.lead.assignedTo, "agent1@co.com");
});
