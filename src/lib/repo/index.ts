import "server-only";
import path from "node:path";
import type { LeadsRepository } from "./types";
import { MemoryRepository } from "./memory";

export type { LeadsRepository } from "./types";

let instance: LeadsRepository | null = null;

/**
 * A misconfiguration the operator has to fix — a missing sheet id, a
 * backend that cannot work on the host. Distinct from an ordinary failure so
 * the API layer can report it verbatim instead of hiding it behind a generic
 * message.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Build the repository for the configured backend.
 *
 * `CRM_DATA_BACKEND=sheets` reads and writes the Google Sheet.
 * `CRM_DATA_BACKEND=memory` uses a local JSON file, which is what makes the
 * app runnable before any Google Cloud setup exists.
 */
export async function getRepository(): Promise<LeadsRepository> {
  if (instance) return instance;

  const backend = (process.env.CRM_DATA_BACKEND ?? "memory").toLowerCase();

  if (backend === "sheets") {
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) {
      throw new ConfigurationError(
        "SHEET_ID is required when CRM_DATA_BACKEND=sheets. See scripts/setup-guide.md.",
      );
    }
    const cacheTtlMs = Number(process.env.SHEET_CACHE_TTL_MS ?? 5000);
    // Imported lazily so the Sheets dependency is not pulled into a memory
    // backed development run.
    const { SheetsRepository } = await import("./sheets");
    instance = new SheetsRepository(spreadsheetId, cacheTtlMs);
    return instance;
  }

  // The memory backend persists to a local file, which is fine on a developer
  // machine but fatal on a serverless host: the filesystem is read-only and
  // ephemeral, so every write fails and every restart loses the data. Fail
  // loudly at the first request instead of serving a dashboard that reads
  // seed data and cannot record a single call.
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new ConfigurationError(
      "CRM_DATA_BACKEND=memory is not supported on Vercel: the filesystem is " +
        "read-only, so no lead can ever be claimed. Set CRM_DATA_BACKEND=sheets.",
    );
  }

  const file =
    process.env.MEMORY_DB_PATH ?? path.join(process.cwd(), ".data", "crm.json");
  instance = new MemoryRepository(file);
  return instance;
}

/** Test seam: swap in a repository directly. */
export function setRepository(repo: LeadsRepository | null): void {
  instance = repo;
}
