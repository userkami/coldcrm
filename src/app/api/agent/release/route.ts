import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { failureResponse } from "@/lib/api";
import { releaseLead } from "@/lib/queue";

/**
 * Skip the current lead: release the lock so it returns to the queue,
 * without logging a call.
 */
export async function POST(request: Request) {
  const auth = await requireRoleApi("AGENT", "MANAGER");
  if ("response" in auth) return auth.response;

  let body: { leadId?: string; claimId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.leadId || !body.claimId) {
    return Response.json(
      { error: "Missing lead or claim reference." },
      { status: 400 },
    );
  }

  try {
    const repo = await getRepository();
    const released = await releaseLead(
      repo,
      { email: auth.session.email, name: auth.session.name },
      body.leadId,
      body.claimId,
    );

    if (!released) {
      return Response.json(
        { error: "This lead is no longer assigned to you." },
        { status: 409 },
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    return failureResponse(
      "release",
      error,
      "Could not release the lead. Please try again.",
    );
  }
}
