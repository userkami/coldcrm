/**
 * Read a response body as JSON, tolerating a non-JSON body.
 *
 * A server error can reach the browser as an HTML error page, and
 * `res.json()` on that throws. Letting the throw escape would report a
 * network failure for what is actually a server error, so the body is parsed
 * defensively and the status code is used to explain the failure.
 */
export async function readJson(
  res: Response,
): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A human-readable explanation of a failed response. */
export function describeFailure(
  res: Response,
  body: Record<string, unknown> | null,
): string {
  const message = typeof body?.error === "string" ? body.error : null;
  if (message) return message;
  if (res.status === 401) {
    return "Your session has expired. Sign in again.";
  }
  if (res.status === 403) {
    return "You do not have permission to do that.";
  }
  if (res.status >= 500) {
    return "The server failed to handle this request. Check the server logs.";
  }
  return `The server responded with an error (${res.status}).`;
}

/** The message of a thrown error, or a fallback for an unknown failure. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
