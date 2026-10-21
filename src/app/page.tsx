import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// The page reads the session cookie, so it cannot be prerendered.
export const instant = false;

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(session.role === "MANAGER" ? "/manager" : "/agent");
}
