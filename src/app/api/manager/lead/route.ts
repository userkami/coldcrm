import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { isLeadStatus } from "@/lib/status";

/**
 * Manager edit of a single lead: change its details, its status, reassign it
 * to an agent, or push it back into the queue.
 */
export async function PATCH(request: Request) {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  let body: {
    leadId?: string;
    name?: string;
    phone?: string;
    company?: string;
    city?: string;
    source?: string;
    status?: string;
    assignedTo?: string;
    callbackDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.leadId) {
    return Response.json({ error: "Missing lead id." }, { status: 400 });
  }

  if (body.status !== undefined && !isLeadStatus(body.status)) {
    return Response.json({ error: "Unknown status." }, { status: 400 });
  }

  const repo = await getRepository();
  const existing = await repo.getLead(body.leadId);
  if (!existing) {
    return Response.json({ error: "Lead not found." }, { status: 404 });
  }

  const patch: Parameters<typeof repo.updateLead>[1] = {};

  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.phone !== undefined) patch.phone = body.phone.trim();
  if (body.company !== undefined) patch.company = body.company.trim();
  if (body.city !== undefined) patch.city = body.city.trim();
  if (body.source !== undefined) patch.source = body.source.trim();
  if (body.callbackDate !== undefined) patch.callbackDate = body.callbackDate;
  if (body.status !== undefined) patch.status = body.status as never;
  if (body.assignedTo !== undefined) patch.assignedTo = body.assignedTo.trim();

  await repo.updateLead(body.leadId, patch);

  return Response.json({ ok: true, lead: await repo.getLead(body.leadId) });
}
