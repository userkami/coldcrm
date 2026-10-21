import { cookies } from "next/headers";
import { getRepository } from "@/lib/repo";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  let body: { email?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const pin = (body.pin ?? "").trim();

  if (!email || !pin) {
    return Response.json(
      { error: "Enter your email and PIN." },
      { status: 400 },
    );
  }

  const repo = await getRepository();
  const user = await repo.getUser(email);

  // Same message whether the account is unknown, inactive or the PIN is
  // wrong, so the form cannot be used to enumerate accounts.
  if (!user || !user.active || user.pin !== pin) {
    return Response.json(
      { error: "Incorrect email or PIN." },
      { status: 401 },
    );
  }

  const token = createSessionToken(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());

  return Response.json({
    ok: true,
    role: user.role,
    name: user.name,
    redirectTo: user.role === "MANAGER" ? "/manager" : "/agent",
  });
}
