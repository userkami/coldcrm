import { requireRole } from "@/lib/auth";
import { AgentPortal } from "@/components/AgentPortal";

// The page reads the session cookie, so it cannot be prerendered.
export const instant = false;

export default async function AgentPage() {
  const session = await requireRole("AGENT", "MANAGER");
  return <AgentPortal agentName={session.name} />;
}
