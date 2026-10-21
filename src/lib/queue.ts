import { randomUUID } from "node:crypto";
import type { Lead, LeadStatus } from "./types";
import type { LeadsRepository } from "./repo/types";

/** How long a claim stays valid before the lead is considered abandoned. */
export const LOCK_TTL_SECONDS = Number(process.env.LOCK_TTL_SECONDS ?? 300);

/**
 * How long a claimant waits after appending its claim before checking
 * whether it won. This is the window in which a competing claim would land.
 */
export const LOCK_SETTLE_MS = Number(process.env.LOCK_SETTLE_MS ?? 1200);

/** How many candidate leads to try before giving up on a claim. */
export const MAX_CLAIM_ATTEMPTS = 8;

export interface ClaimResult {
  lead: Lead | null;
  /** Set when no lead could be claimed, so the UI can explain why. */
  reason?: "empty" | "busy" | "error";
}

export interface AgentIdentity {
  email: string;
  name: string;
}

/**
 * A lead is claimable when it is untouched, or when a previous claim on it
 * has expired (the agent walked away without logging anything).
 */
export function isClaimable(lead: Lead, now: number = Date.now()): boolean {
  if (lead.status === "New") return true;
  if (lead.status !== "Calling") return false;

  // A "Calling" lead with no timestamp is an orphan from a crashed write.
  if (!lead.lockTimestamp) return true;

  const lockedAt = Date.parse(lead.lockTimestamp);
  if (Number.isNaN(lockedAt)) return true;

  return now - lockedAt > LOCK_TTL_SECONDS * 1000;
}

/**
 * Order the claimable leads: fresh leads first, then stale in-progress ones.
 * Within each group the order is shuffled, so two agents clicking
 * "Get Next Lead" at the same moment do not both reach for the same top row.
 */
export function orderCandidates(
  leads: Lead[],
  now: number = Date.now(),
  random: () => number = Math.random,
): Lead[] {
  const fresh = leads.filter((l) => l.status === "New");
  const stale = leads.filter(
    (l) => l.status === "Calling" && isClaimable(l, now),
  );

  const shuffle = (list: Lead[]): Lead[] => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  return [...shuffle(fresh), ...shuffle(stale)];
}

/**
 * Among the still-open claims on a lead, is this one the earliest?
 *
 * This is the reconciliation step that turns a lost race into a detectable
 * condition: two agents can both append a claim, but only the earlier one
 * proceeds. The loser backs off and takes a different lead.
 *
 * The ordering is total, so exactly one claim is ever the winner:
 *   - by timestamp, earliest first;
 *   - ties broken by claim id, because two claims can easily land in the same
 *     millisecond, and without a deterministic tie-break both agents would
 *     consider themselves the winner;
 *   - a claim with an unreadable timestamp sorts last, so a malformed row
 *     can never win the race.
 */
export function isEarliestOpenClaim(
  claims: { claimId: string; claimedAt: string }[],
  claimId: string,
): boolean {
  if (!claims.some((c) => c.claimId === claimId)) return false;

  const rank = (c: { claimId: string; claimedAt: string }) => {
    const at = Date.parse(c.claimedAt);
    return { at: Number.isNaN(at) ? Infinity : at, id: c.claimId };
  };

  let winner = claims[0];
  for (const claim of claims.slice(1)) {
    const a = rank(claim);
    const b = rank(winner);
    if (a.at < b.at || (a.at === b.at && a.id < b.id)) {
      winner = claim;
    }
  }

  return winner.claimId === claimId;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claim the next lead for an agent.
 *
 * The four-layer defence against two agents grabbing the same lead:
 *
 *  1. Append a claim to the append-only ledger (no lost updates).
 *  2. Wait for a settle window so a competing claim can land.
 *  3. Proceed only if this claim is the earliest open one for that lead.
 *  4. Write the lock token to the sheet and confirm it survived.
 *
 * Note that step 4 is a read-after-write, not a compare-and-swap: Google
 * Sheets offers no such primitive. The disposition-time token check is what
 * actually prevents one agent's write from clobbering another's.
 */
export async function claimNextLead(
  repo: LeadsRepository,
  agent: AgentIdentity,
  options: {
    settleMs?: number;
    maxAttempts?: number;
    now?: () => number;
  } = {},
): Promise<ClaimResult> {
  const settleMs = options.settleMs ?? LOCK_SETTLE_MS;
  const maxAttempts = options.maxAttempts ?? MAX_CLAIM_ATTEMPTS;
  const now = options.now ?? Date.now;

  const leads = await repo.listLeads();
  const candidates = orderCandidates(leads, now());

  if (candidates.length === 0) {
    // Distinguish "no leads at all" from "every lead is locked by someone".
    const anyLeads = leads.length > 0;
    return { lead: null, reason: anyLeads ? "busy" : "empty" };
  }

  for (const candidate of candidates.slice(0, maxAttempts)) {
    const claimId = randomUUID();
    const claimedAt = new Date(now()).toISOString();

    await repo.appendClaim({
      claimId,
      leadId: candidate.id,
      agentEmail: agent.email,
      claimedAt,
      closedAt: "",
      outcome: "",
    });

    // Let a competing claim land before we test for it.
    if (settleMs > 0) await sleep(settleMs);

    const openClaims = await repo.listOpenClaims(candidate.id);
    if (!isEarliestOpenClaim(openClaims, claimId)) {
      // Lost the race for this lead. Record it and try the next one.
      await repo.closeClaim(claimId, "lost", new Date(now()).toISOString());
      continue;
    }

    await repo.writeLock(candidate.id, {
      status: "Calling",
      assignedTo: agent.email,
      lockTimestamp: claimedAt,
      lockToken: claimId,
    });

    // Confirm the lock we just wrote is still ours. Another agent may have
    // overwritten it in the window between our write and this read.
    const confirmed = await repo.getLead(candidate.id);
    if (confirmed && confirmed.lockToken === claimId) {
      return { lead: confirmed };
    }

    // The lock was taken over. Give it back and move on.
    await repo.closeClaim(claimId, "lost", new Date(now()).toISOString());
  }

  return { lead: null, reason: "busy" };
}

export interface DispositionInput {
  leadId: string;
  claimId: string;
  status: LeadStatus;
  notes: string;
  callbackDate: string;
}

export type DispositionResult =
  | { ok: true; nextLead: Lead | null; nextReason?: ClaimResult["reason"] }
  | { ok: false; error: "not-found" | "stale-claim" | "invalid-status" };

/**
 * Record the outcome of a call.
 *
 * The lock-token check is the load-bearing part: if the lead is no longer
 * ours, the write is refused rather than silently overwriting whatever the
 * current holder recorded.
 */
export async function logDisposition(
  repo: LeadsRepository,
  agent: AgentIdentity,
  input: DispositionInput,
  options: { settleMs?: number; maxAttempts?: number; now?: () => number } = {},
): Promise<DispositionResult> {
  const now = options.now ?? Date.now;

  const lead = await repo.getLead(input.leadId);
  if (!lead) return { ok: false, error: "not-found" };

  if (!lead.lockToken || lead.lockToken !== input.claimId) {
    return { ok: false, error: "stale-claim" };
  }
  if (lead.assignedTo && lead.assignedTo !== agent.email) {
    return { ok: false, error: "stale-claim" };
  }

  const at = new Date(now()).toISOString();
  await repo.writeDisposition(input.leadId, {
    status: input.status,
    notes: input.notes,
    callbackDate: input.callbackDate,
    lastCalledBy: agent.email,
    lastCalledAt: at,
  });

  await repo.appendCallLog({
    timestamp: at,
    leadId: input.leadId,
    agentEmail: agent.email,
    agentName: agent.name,
    status: input.status,
    notes: input.notes,
    callbackDate: input.callbackDate,
  });

  await repo.closeClaim(input.claimId, "completed", at);

  // Auto-load the next lead, as the spec requires.
  const next = await claimNextLead(repo, agent, options);
  return { ok: true, nextLead: next.lead, nextReason: next.reason };
}

/**
 * Release a claim without logging a disposition — the "skip this lead" path.
 * The lead returns to the queue so another agent (or this one) can take it.
 */
export async function releaseLead(
  repo: LeadsRepository,
  agent: AgentIdentity,
  leadId: string,
  claimId: string,
  options: { now?: () => number } = {},
): Promise<boolean> {
  const now = options.now ?? Date.now;
  const lead = await repo.getLead(leadId);
  if (!lead) return false;
  if (lead.lockToken && lead.lockToken !== claimId) return false;

  await repo.releaseLock(leadId);
  await repo.closeClaim(claimId, "released", new Date(now()).toISOString());
  return true;
}
