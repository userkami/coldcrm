import { promises as fs } from "node:fs";
import path from "node:path";
import type { CallLog, Claim, Lead, LeadStatus, User } from "../types";
import { normalizeStatus } from "../status";
import type { LeadsRepository } from "./types";

interface Database {
  leads: Lead[];
  users: User[];
  callLogs: CallLog[];
  claims: Claim[];
}

const EMPTY: Database = { leads: [], users: [], callLogs: [], claims: [] };

/**
 * A file-backed repository used for local development and for verifying the
 * app before any Google Cloud credentials exist.
 *
 * It intentionally mirrors the Sheets implementation's *semantics* rather than
 * its guarantees: reads and writes are separate awaited operations, so a
 * read-then-write claim is a genuine race here too. That is what makes the
 * reconciliation logic testable against this backend.
 */
export class MemoryRepository implements LeadsRepository {
  private db: Database = structuredClone(EMPTY);
  private loaded = false;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private readonly filePath: string;

  // Written as an explicit field rather than a parameter property: Node's
  // type-stripping loader (used by the test runner) does not support
  // parameter properties.
  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<Database>;
      this.db = {
        leads: parsed.leads ?? [],
        users: parsed.users ?? [],
        callLogs: parsed.callLogs ?? [],
        claims: parsed.claims ?? [],
      };
    } catch {
      this.db = structuredClone(EMPTY);
    }
    this.loaded = true;
  }

  /** Serialise mutations so a read-modify-write inside one method is safe. */
  private async mutate<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    await this.load();
    const run = this.writeQueue.then(async () => {
      const result = await fn(this.db);
      await this.persist();
      return result;
    });
    // Keep the chain alive even if one mutation throws.
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.db, null, 2), "utf8");
  }

  private static clone<T>(value: T): T {
    return structuredClone(value);
  }

  // ---- Leads -------------------------------------------------------------

  async listLeads(): Promise<Lead[]> {
    await this.load();
    return MemoryRepository.clone(this.db.leads);
  }

  async getLead(id: string): Promise<Lead | null> {
    await this.load();
    const found = this.db.leads.find((l) => l.id === id);
    return found ? MemoryRepository.clone(found) : null;
  }

  async writeLock(
    id: string,
    patch: {
      status: LeadStatus;
      assignedTo: string;
      lockTimestamp: string;
      lockToken: string;
    },
  ): Promise<void> {
    await this.mutate((db) => {
      const lead = db.leads.find((l) => l.id === id);
      if (!lead) return;
      lead.status = patch.status;
      lead.assignedTo = patch.assignedTo;
      lead.lockTimestamp = patch.lockTimestamp;
      lead.lockToken = patch.lockToken;
    });
  }

  async writeDisposition(
    id: string,
    patch: {
      status: LeadStatus;
      notes: string;
      callbackDate: string;
      lastCalledBy: string;
      lastCalledAt: string;
    },
  ): Promise<void> {
    await this.mutate((db) => {
      const lead = db.leads.find((l) => l.id === id);
      if (!lead) return;
      lead.status = patch.status;
      // Notes accumulate: the agent's latest remark is appended to the
      // history rather than replacing it, matching the plan's "appends call
      // notes" wording.
      lead.notes = lead.notes
        ? `${lead.notes}\n${patch.notes}`.trim()
        : patch.notes;
      lead.callbackDate = patch.callbackDate;
      lead.lastCalledBy = patch.lastCalledBy;
      lead.lastCalledAt = patch.lastCalledAt;
      lead.lockToken = "";
      lead.lockTimestamp = "";
      lead.assignedTo = "";
    });
  }

  async releaseLock(id: string): Promise<void> {
    await this.mutate((db) => {
      const lead = db.leads.find((l) => l.id === id);
      if (!lead) return;
      lead.status = "New";
      lead.lockToken = "";
      lead.lockTimestamp = "";
      lead.assignedTo = "";
    });
  }

  async updateLead(
    id: string,
    patch: Partial<
      Pick<
        Lead,
        "name" | "phone" | "company" | "city" | "source" | "status" | "assignedTo" | "callbackDate"
      >
    >,
  ): Promise<void> {
    await this.mutate((db) => {
      const lead = db.leads.find((l) => l.id === id);
      if (!lead) return;
      Object.assign(lead, patch);
      if (patch.status !== undefined) lead.status = normalizeStatus(patch.status);
      // Requeuing a lead must also drop the lock, otherwise it stays
      // unclaimable until the old lock expires.
      if (patch.status === "New") {
        lead.lockToken = "";
        lead.lockTimestamp = "";
        lead.assignedTo = "";
      }
    });
  }

  // ---- Claims ------------------------------------------------------------

  async appendClaim(claim: Claim): Promise<void> {
    await this.mutate((db) => {
      db.claims.push(claim);
    });
  }

  async closeClaim(claimId: string, outcome: string, closedAt: string): Promise<void> {
    await this.mutate((db) => {
      const claim = db.claims.find((c) => c.claimId === claimId);
      if (!claim) return;
      claim.outcome = outcome;
      claim.closedAt = closedAt;
    });
  }

  async listClaims(): Promise<Claim[]> {
    await this.load();
    return MemoryRepository.clone(this.db.claims);
  }

  async listOpenClaims(leadId?: string): Promise<Claim[]> {
    await this.load();
    return MemoryRepository.clone(
      this.db.claims.filter(
        (c) => !c.closedAt && (leadId === undefined || c.leadId === leadId),
      ),
    );
  }

  // ---- Call logs ---------------------------------------------------------

  async appendCallLog(log: CallLog): Promise<void> {
    await this.mutate((db) => {
      db.callLogs.push(log);
    });
  }

  async listCallLogs(): Promise<CallLog[]> {
    await this.load();
    return MemoryRepository.clone(this.db.callLogs);
  }

  // ---- Users -------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    await this.load();
    return MemoryRepository.clone(this.db.users);
  }

  async getUser(email: string): Promise<User | null> {
    await this.load();
    const key = email.trim().toLowerCase();
    const found = this.db.users.find((u) => u.email.toLowerCase() === key);
    return found ? MemoryRepository.clone(found) : null;
  }

  async upsertUser(user: User): Promise<void> {
    await this.mutate((db) => {
      const key = user.email.trim().toLowerCase();
      const index = db.users.findIndex((u) => u.email.toLowerCase() === key);
      const next = { ...user, email: key };
      if (index >= 0) db.users[index] = next;
      else db.users.push(next);
    });
  }

  async removeUser(email: string): Promise<void> {
    await this.mutate((db) => {
      const key = email.trim().toLowerCase();
      db.users = db.users.filter((u) => u.email.toLowerCase() !== key);
    });
  }
}
