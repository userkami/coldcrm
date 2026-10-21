import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { failureResponse } from "@/lib/api";
import { computeAnalytics } from "@/lib/analytics";

export async function GET() {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  try {
    const repo = await getRepository();
    const [users, leads, logs] = await Promise.all([
      repo.listUsers(),
      repo.listLeads(),
      repo.listCallLogs(),
    ]);

    return Response.json(computeAnalytics(users, leads, logs));
  } catch (error) {
    return failureResponse(
      "analytics",
      error,
      "Could not load the dashboard. Please try again.",
    );
  }
}
