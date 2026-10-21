import { ConfigurationError } from "@/lib/repo";

/**
 * Turn a thrown error into a JSON response.
 *
 * Without this the platform returns an HTML error page, which the browser
 * cannot tell apart from a network failure — the operator sees "Could not
 * reach the server" and has no way to tell a misconfigured deployment from a
 * broken one.
 *
 * A configuration problem is reported verbatim, because only the operator can
 * fix it and the message says how. Anything else is logged and reported
 * generically, so an unexpected failure does not leak internals.
 *
 * This is deliberately a plain synchronous function. Wrapping the handler in
 * an async helper changes which promise owns the request, and Next's
 * prerender scope tracking then reports `cookies()` as a hanging rejection.
 * The route handlers therefore call this from inside their own `try`.
 */
export function failureResponse(
  label: string,
  error: unknown,
  fallback: string,
): Response {
  console.error(`${label} failed:`, error);
  if (error instanceof ConfigurationError) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
