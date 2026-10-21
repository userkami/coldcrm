import { LEAD_STATUSES, type LeadStatus } from "./types";

export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" &&
    (LEAD_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Normalize a raw sheet cell into a known status. Unrecognised or blank
 * values fall back to "New" so a malformed row can never wedge an agent out
 * of the queue.
 */
export function normalizeStatus(value: unknown): LeadStatus {
  if (isLeadStatus(value)) return value;
  if (typeof value === "string") {
    const match = LEAD_STATUSES.find(
      (s) => s.toLowerCase() === value.trim().toLowerCase(),
    );
    if (match) return match;
  }
  return "New";
}

/** Human-friendly label for a status, used in the manager UI. */
export function statusLabel(status: LeadStatus): string {
  switch (status) {
    case "New":
      return "New";
    case "Calling":
      return "Calling";
    case "Connected - Interested":
      return "Interested";
    case "Connected - Not Interested":
      return "Not interested";
    case "Callback Requested":
      return "Callback";
    case "No Answer":
      return "No answer";
    case "Wrong Number":
      return "Wrong number";
  }
}
