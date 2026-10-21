import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { failureResponse } from "@/lib/api";
import { businessDate } from "@/lib/call-history";

/**
 * The agent's own numbers for the stats bar: calls logged today, how many
 * landed as interested, and how many callbacks they are holding.
 */
export async function GET() {
  const auth = await requireRoleApi("AGENT", "MANAGER");
  if ("response" in auth) return auth.response;

  try {
    const repo = await getRepository();
    const [logs, leads] = await Promise.all([
      repo.listCallLogs(),
      repo.listLeads(),
    ]);

    const now = new Date();
    const mine = logs.filter((l) => l.agentEmail === auth.session.email);
    const timeZone = process.env.CRM_TIME_ZONE || "Asia/Karachi";
    const todayKey = businessDate(now, timeZone);
    const today = mine.filter((l) => Number.isFinite(Date.parse(l.timestamp)) && businessDate(new Date(l.timestamp), timeZone) === todayKey);

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
  } catch (error) {
    return failureResponse(
      "agent stats",
      error,
      "Could not load your stats. Please try again.",
    );
  }
}
