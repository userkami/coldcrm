import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role, Session } from "./types";

export const SESSION_COOKIE = "crm_session";

/** Sessions last one working day. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SECRET is not set. Copy .env.example to .env.local and set it to a long random string.",
    );
  }
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Mint a session token.
 *
 * The token is `base64url(payload).hmac`, so it is tamper-evident without a
 * server-side session store — the CRM has no database-backed sessions and
 * the Sheets API is not a session store.
 */
export function createSessionToken(
  user: { email: string; name: string; role: Role },
  now: number = Date.now(),
): string {
  const session: Session = {
    email: user.email,
    name: user.name,
    role: user.role,
    exp: now + SESSION_TTL_MS,
  };
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

/** Verify a token and return its session, or null if it is invalid/expired. */
export function verifySessionToken(
  token: string | undefined,
  now: number = Date.now(),
): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);

  // Compare in constant time so a wrong signature cannot be discovered
  // byte by byte.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let session: Session;
  try {
    session = JSON.parse(fromBase64url(payload)) as Session;
  } catch {
    return null;
  }

  if (!session || typeof session.exp !== "number" || session.exp <= now) {
    return null;
  }
  if (session.role !== "AGENT" && session.role !== "MANAGER") return null;
  return session;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
