/**
 * Core domain types for the Cold-Calling CRM.
 *
 * The `Leads` tab schema follows the Phase 1 spec exactly for the first ten
 * columns (id, name, phone, status, assignedTo, lockTimestamp, notes,
 * callbackDate, lastCalledBy, lastCalledAt). Four additive columns carry
 * optional context (company, city, source) plus one internal column used by
 * the locking engine (lockToken).
 */

/** Lead lifecycle states, exactly as defined in the project plan. */
export const LEAD_STATUSES = [
  "New",
  "Calling",
  "Connected - Interested",
  "Connected - Not Interested",
  "Callback Requested",
  "No Answer",
  "Wrong Number",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses that count as "the agent reached a human". */
export const CONNECTED_STATUSES: readonly LeadStatus[] = [
  "Connected - Interested",
  "Connected - Not Interested",
];

/** Statuses that represent a lead still awaiting a future action. */
export const OPEN_STATUSES: readonly LeadStatus[] = [
  "New",
  "Calling",
  "Callback Requested",
];

export type Role = "AGENT" | "MANAGER";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  assignedTo: string;
  lockTimestamp: string;
  notes: string;
  callbackDate: string;
  lastCalledBy: string;
  lastCalledAt: string;
  /** Optional context, additive to the spec schema. */
  company: string;
  city: string;
  source: string;
  /** Internal: the claim token of whoever currently holds this lead. */
  lockToken: string;
}

export interface User {
  email: string;
  name: string;
  pin: string;
  role: Role;
  active: boolean;
}

/**
 * A user as sent to the browser: identical to {@link User} minus the PIN.
 * The manager's agent list must never expose PINs.
 */
export type PublicUser = Omit<User, "pin">;

export interface CallLog {
  timestamp: string;
  leadId: string;
  agentEmail: string;
  agentName: string;
  status: LeadStatus;
  notes: string;
  callbackDate: string;
}

/**
 * Append-only lock ledger entry. One row per claim attempt. `closedAt` and
 * `outcome` are written back when the claim is released or completed.
 */
export interface Claim {
  claimId: string;
  leadId: string;
  agentEmail: string;
  claimedAt: string;
  closedAt: string;
  outcome: string;
}

export interface AgentActivity {
  email: string;
  name: string;
  callsToday: number;
  connectedToday: number;
  interestedToday: number;
  callbacksToday: number;
  openCallbacks: number;
}

export interface KpiSummary {
  totalLeads: number;
  contacted: number;
  open: number;
  conversionRate: number;
}

export interface StatusBreakdownEntry {
  status: LeadStatus;
  count: number;
  percentage: number;
}

export interface CallsPerDay {
  day: string;
  calls: number;
  connected: number;
  interested: number;
}

export interface ManagerAnalytics {
  kpis: KpiSummary;
  agents: AgentActivity[];
  breakdown: StatusBreakdownEntry[];
  callsPerDay: CallsPerDay[];
}

/** The session carried by the signed auth cookie. */
export interface Session {
  email: string;
  name: string;
  role: Role;
  /** Expiry as epoch milliseconds. */
  exp: number;
}
