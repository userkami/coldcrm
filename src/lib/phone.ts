/**
 * Phone helpers. The dialer renders `tel:` links, so the number must be
 * normalised to a bare `+` followed by digits — no spaces, dashes or
 * parentheses — or the mobile dialer will reject it.
 */

/** Strip everything that is not a digit or a leading `+`. */
export function sanitizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${plus}${digits}` : "";
}

/**
 * Format a stored number for display: `+92 300 1234567`.
 * Falls back to the raw value when it does not look like a real number.
 */
export function formatPhone(raw: string): string {
  const clean = sanitizePhone(raw);
  if (!clean.startsWith("+")) return clean || raw;

  const digits = clean.slice(1);
  // Group the last 7 digits, leaving any country/area prefix intact.
  if (digits.length <= 7) return clean;

  const tail = digits.slice(-7);
  const head = digits.slice(0, digits.length - 7);
  return `${head} ${tail.slice(0, 3)} ${tail.slice(3)}`.replace(/\s+/g, " ").trim();
}

/**
 * Build the `tel:` href. Returns null when the number is unusable so the UI
 * can disable the dial button rather than link to a broken number.
 */
export function telHref(raw: string): string | null {
  const clean = sanitizePhone(raw);
  if (clean.replace(/\D/g, "").length < 6) return null;
  return `tel:${clean}`;
}
