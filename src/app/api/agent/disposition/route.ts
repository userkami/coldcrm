import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { logDisposition } from "@/lib/queue";
import { isLeadStatus } from "@/lib/status";
import type { LeadStatus } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await requireRoleApi("AGENT", "MANAGER");
  if ("response" in auth) return auth.response;

  let body: {
    leadId?: string;
    claimId?: string;
    status?: string;
    notes?: string;
    callbackDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { leadId, claimId } = body;
  if (!leadId || !claimId) {
    return Response.json(
      { error: "Missing lead or claim reference." },
      { status: 400 },
    );
  }

  if (!isLeadStatus(body.status)) {
    return Response.json({ error: "Unknown outcome." }, { status: 400 });
  }
  const status = body.status as LeadStatus;

  // A callback date is only meaningful for a requested callback.
  const callbackDate =
    status === "Callback Requested" ? (body.callbackDate ?? "") : "";

  const repo = await getRepository();
  const result = await logDisposition(repo, {
    email: auth.session.email,
    name: auth.session.name,
  }, {
    leadId,
    claimId,
    status,
    notes: (body.notes ?? "").trim(),
    callbackDate,
  });

  if (!result.ok) {
    if (result.error === "not-found") {
      return Response.json({ error: "Lead not found." }, { status: 404 });
    }
    // The lead is no longer ours: another agent holds it, or our lock
    // expired. Tell the client so it can drop the card rather than
    // overwriting the current holder's notes.
    return Response.json(
      {
        error:
          "This lead is no longer assigned to you. It has been returned to the queue.",
        code: "stale-claim",
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    nextLead: result.nextLead,
    reason: result.nextReason ?? null,
  });
}
