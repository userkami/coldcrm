import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { failureResponse } from "@/lib/api";
import { claimNextLead } from "@/lib/queue";

// Claiming a lead writes to the sheet and waits out the settle window, so the
// function needs more than the platform default to finish.
export const maxDuration = 30;

export async function POST() {
  const auth = await requireRoleApi("AGENT", "MANAGER");
  if ("response" in auth) return auth.response;

  try {
    const repo = await getRepository();
    const result = await claimNextLead(repo, {
      email: auth.session.email,
      name: auth.session.name,
    });

    return Response.json({
      lead: result.lead,
      reason: result.reason ?? null,
    });
  } catch (error) {
    return failureResponse(
      "next-lead",
      error,
      "Could not claim a lead. Please try again.",
    );
  }
}
