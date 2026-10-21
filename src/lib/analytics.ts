import {
  CONNECTED_STATUSES,
  LEAD_STATUSES,
  type AgentActivity,
  type CallLog,
  type KpiSummary,
  type Lead,
  type LeadStatus,
  type ManagerAnalytics,
  type StatusBreakdownEntry,
  type User,
  type CallsPerDay,
} from "./types";

/** Start of "today" in the server's local timezone. */
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isToday(iso: string, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= startOfToday(now).getTime();
}

export { isToday };

/**
 * A lead counts as "contacted" once an agent has actually spoken to someone.
 * A no-answer or a wrong number is a touch but not a conversation.
 */
export function isContacted(lead: Lead): boolean {
  return (
    CONNECTED_STATUSES.includes(lead.status) ||
    lead.status === "Callback Requested"
  );
}

/**
 * Conversion rate: of the leads that were actually contacted, how many became
 * interested. Using contacted leads as the denominator (rather than all
 * leads) is what makes the number meaningful.
 */
export function computeKpis(leads: Lead[]): KpiSummary {
  const total = leads.length;
  const contacted = leads.filter(isContacted).length;
  const open = leads.filter(
    (l) => l.status === "New" || l.status === "Calling",
  ).length;
  const interested = leads.filter(
    (l) => l.status === "Connected - Interested",
  ).length;

  return {
    totalLeads: total,
    contacted,
    open,
    conversionRate: contacted === 0 ? 0 : (interested / contacted) * 100,
  };
}

/** Count of each status, with the percentage of the whole list. */
export function computeBreakdown(leads: Lead[]): StatusBreakdownEntry[] {
  const counts = new Map<LeadStatus, number>();
  for (const status of LEAD_STATUSES) counts.set(status, 0);
  for (const lead of leads) {
    counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
  }

  const total = leads.length;
  return LEAD_STATUSES.map((status) => {
    const count = counts.get(status) ?? 0;
    return {
      status,
      count,
      percentage: total === 0 ? 0 : (count / total) * 100,
    };
  });
}

/**
 * Per-agent activity for today, plus each agent's open callbacks.
 *
 * "Calls today" comes from the CallLogs tab rather than from the Leads tab,
 * because a lead can be called more than once and the Leads tab only ever
 * stores the most recent outcome.
 */
export function computeAgentActivity(
  users: User[],
  leads: Lead[],
  logs: CallLog[],
  now: Date = new Date(),
): AgentActivity[] {
  const agents = users.filter((u) => u.role === "AGENT");

  return agents.map((agent) => {
    const own = logs.filter((l) => l.agentEmail === agent.email);
    const today = own.filter((l) => isToday(l.timestamp, now));

    const openCallbacks = leads.filter(
      (l) =>
        l.status === "Callback Requested" &&
        l.lastCalledBy === agent.email &&
        (!l.callbackDate || Date.parse(l.callbackDate) >= now.getTime()),
    ).length;

    return {
      email: agent.email,
      name: agent.name,
      callsToday: today.length,
      connectedToday: today.filter((l) => CONNECTED_STATUSES.includes(l.status))
        .length,
      interestedToday: today.filter(
        (l) => l.status === "Connected - Interested",
      ).length,
      callbacksToday: today.filter(
        (l) => l.status === "Callback Requested",
      ).length,
      openCallbacks,
    };
  });
}

/**
 * A local-time date key, `YYYY-MM-DD`.
 *
 * Both the buckets and the logs must be keyed the same way, and it has to be
 * local time: "today" means the agent's today, not UTC's today. Keying one
 * side in UTC and the other in local time silently misplaces every call in
 * any timezone that is not UTC.
 */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Calls per day over the last `days` days, oldest first. */
export function computeCallsPerDay(
  logs: CallLog[],
  days = 7,
  now: Date = new Date(),
): CallsPerDay[] {
  const buckets: CallsPerDay[] = [];
  const today = startOfToday(now);

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const key = localDateKey(day);
    buckets.push({ day: key, calls: 0, connected: 0, interested: 0 });
  }

  const byDay = new Map(buckets.map((b) => [b.day, b]));

  for (const log of logs) {
    const t = Date.parse(log.timestamp);
    if (Number.isNaN(t)) continue;
    const key = localDateKey(new Date(t));
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.calls += 1;
    if (CONNECTED_STATUSES.includes(log.status)) bucket.connected += 1;
    if (log.status === "Connected - Interested") bucket.interested += 1;
  }

  return buckets;
}

export function computeAnalytics(
  users: User[],
  leads: Lead[],
  logs: CallLog[],
  now: Date = new Date(),
): ManagerAnalytics {
  return {
    kpis: computeKpis(leads),
    agents: computeAgentActivity(users, leads, logs, now),
    breakdown: computeBreakdown(leads),
    callsPerDay: computeCallsPerDay(logs, 7, now),
  };
}
