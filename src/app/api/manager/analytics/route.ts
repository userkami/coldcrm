import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { computeAnalytics } from "@/lib/analytics";

export async function GET() {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  const repo = await getRepository();
  const [users, leads, logs] = await Promise.all([
    repo.listUsers(),
    repo.listLeads(),
    repo.listCallLogs(),
  ]);

  return Response.json(computeAnalytics(users, leads, logs));
}
