import { requireRole } from "@/lib/auth";
import { ManagerDashboard } from "@/components/ManagerDashboard";

// The page reads the session cookie, so it cannot be prerendered.
export const instant = false;

export default async function ManagerPage() {
  const session = await requireRole("MANAGER");
  return (
    <ManagerDashboard
      managerName={session.name}
      managerEmail={session.email}
    />
  );
}
