import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { failureResponse } from "@/lib/api";

export async function GET() {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  try {
    const repo = await getRepository();
    const leads = await repo.listLeads();

    return Response.json({ leads });
  } catch (error) {
    return failureResponse(
      "manager leads",
      error,
      "Could not load the leads. Please try again.",
    );
  }
}
