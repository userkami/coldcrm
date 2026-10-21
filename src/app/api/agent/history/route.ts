import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { failureResponse } from "@/lib/api";
import { buildCallHistory, historyCsv, historyFilters } from "@/lib/call-history";

export async function GET(request: Request) {
  const auth = await requireRoleApi("AGENT", "MANAGER");
  if ("response" in auth) return auth.response;
  const params = new URL(request.url).searchParams;
  const timeZone = process.env.CRM_TIME_ZONE || "Asia/Karachi";
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch (error) {
    return failureResponse("call history timezone", error, "The business timezone is not configured correctly.");
  }
  let filters;
  const page = Number(params.get("page") ?? "1");
  try {
    filters = historyFilters(params, timeZone);
    if (!Number.isSafeInteger(page) || page < 1) throw new Error("Choose a valid page.");
    if (params.has("format") && params.get("format") !== "csv") throw new Error("Unsupported export format.");
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  try {
    const repo = await getRepository();
    const [logs, leads] = await Promise.all([repo.listCallLogs(), repo.listLeads()]);
    const history = buildCallHistory(logs, leads, auth.session.email, filters, timeZone);
    const headers = { "Cache-Control": "private, no-store" };
    if (params.get("format") === "csv") {
      return new Response(historyCsv(history.rows, timeZone), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="my-calls_${filters.from}_to_${filters.to}.csv"`,
        },
      });
    }
    const pageSize = 25;
    const currentPage = Math.min(page, Math.max(1, Math.ceil(history.rows.length / pageSize)));
    return Response.json({
      ...history, rows: history.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      total: history.rows.length, page: currentPage, pageSize, filters, timeZone,
    }, { headers });
  } catch (error) {
    return failureResponse("agent history", error, "Could not load your call history. Please try again.");
  }
}
