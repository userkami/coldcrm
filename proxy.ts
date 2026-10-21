import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Optimistic route guard.
 *
 * This only checks that a validly signed session cookie is present — it does
 * not hit the database, because the proxy runs on every request. The
 * authoritative check lives in `lib/auth.ts` and runs again inside each page
 * and each API route, so a request that slips past here is still rejected.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);

  const { pathname } = request.nextUrl;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // An agent must not land on the manager dashboard, and a manager must not
  // be pushed out of theirs.
  if (pathname.startsWith("/manager") && session.role !== "MANAGER") {
    return NextResponse.redirect(new URL("/agent", request.url));
  }
  if (pathname.startsWith("/agent") && session.role !== "AGENT" && session.role !== "MANAGER") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/agent/:path*", "/manager/:path*"],
};
