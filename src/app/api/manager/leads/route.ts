import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";

export async function GET() {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  const repo = await getRepository();
  const leads = await repo.listLeads();

  return Response.json({ leads });
}
