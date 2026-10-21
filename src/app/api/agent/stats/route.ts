import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { isToday } from "@/lib/analytics";

/**
 * The agent's own numbers for the stats bar: calls logged today, how many
 * landed as interested, and how many callbacks they are holding.
 */
export async function GET() {
  const auth = await requireRoleApi("AGENT", "MANAGER");
  if ("response" in auth) return auth.response;

  const repo = await getRepository();
  const [logs, leads] = await Promise.all([
    repo.listCallLogs(),
    repo.listLeads(),
  ]);

  const now = new Date();
  const mine = logs.filter((l) => l.agentEmail === auth.session.email);
  const today = mine.filter((l) => isToday(l.timestamp, now));

  const openCallbacks = leads.filter(
    (l) =>
      l.status === "Callback Requested" &&
      l.lastCalledBy === auth.session.email &&
      (!l.callbackDate || Date.parse(l.callbackDate) >= now.getTime()),
  );

  return Response.json({
    callsToday: today.length,
    interestedToday: today.filter(
      (l) => l.status === "Connected - Interested",
    ).length,
    openCallbacks: openCallbacks.length,
  });
}
