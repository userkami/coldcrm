import "server-only";
import path from "node:path";
import type { LeadsRepository } from "./types";
import { MemoryRepository } from "./memory";

export type { LeadsRepository } from "./types";

let instance: LeadsRepository | null = null;

/**
 * Build the repository for the configured backend.
 *
 * `CRM_DATA_BACKEND=sheets` (the default in production) reads and writes the
 * Google Sheet. `CRM_DATA_BACKEND=memory` uses a local JSON file, which is
 * what makes the app runnable before any Google Cloud setup exists.
 */
export async function getRepository(): Promise<LeadsRepository> {
  if (instance) return instance;

  const backend = (process.env.CRM_DATA_BACKEND ?? "memory").toLowerCase();

  if (backend === "sheets") {
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) {
      throw new Error(
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

  const file =
    process.env.MEMORY_DB_PATH ?? path.join(process.cwd(), ".data", "crm.json");
  instance = new MemoryRepository(file);
  return instance;
}

/** Test seam: swap in a repository directly. */
export function setRepository(repo: LeadsRepository | null): void {
  instance = repo;
}
