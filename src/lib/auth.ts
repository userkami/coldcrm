import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Session } from "./types";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Read and verify the current session.
 *
 * `cookies()` is async in Next 16, so every caller awaits it.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Require a session with one of the given roles.
 *
 * In a Server Component this redirects to the login page. In a Route Handler
 * call `requireRoleApi` instead, so the response is a 401/403 rather than a
 * redirect.
 */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roles.includes(session.role)) {
    redirect(session.role === "MANAGER" ? "/manager" : "/agent");
  }
  return session;
}

/**
 * Route-handler variant: returns the session or a ready-to-return error
 * response.
 */
export async function requireRoleApi(
  ...roles: Role[]
): Promise<{ session: Session } | { response: Response }> {
  const session = await getSession();
  if (!session) {
    return {
      response: Response.json({ error: "Not authenticated." }, { status: 401 }),
    };
  }
  if (!roles.includes(session.role)) {
    return {
      response: Response.json(
        { error: "You do not have permission to do that." },
        { status: 403 },
      ),
    };
  }
  return { session };
}
