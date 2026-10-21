import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { claimNextLead } from "@/lib/queue";

export async function POST() {
  const auth = await requireRoleApi("AGENT", "MANAGER");
  if ("response" in auth) return auth.response;

  const repo = await getRepository();
  const result = await claimNextLead(repo, {
    email: auth.session.email,
    name: auth.session.name,
  });

  return Response.json({
    lead: result.lead,
    reason: result.reason ?? null,
  });
}
