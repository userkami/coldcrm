import type { CallLog, Claim, Lead, LeadStatus, User } from "../types";

/**
 * The persistence seam for the whole app.
 *
 * The UI and the locking engine only ever talk to this interface, which is
 * what makes the Google Sheets implementation swappable for a transactional
 * store (Firestore, Postgres) in a later phase without touching a component.
 */
export interface LeadsRepository {
  // ---- Leads -------------------------------------------------------------
  listLeads(): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  /**
   * Claim a lead: write status, assignee, lock timestamp and lock token in a
   * single atomic operation.
   */
  writeLock(
    id: string,
    patch: {
      status: LeadStatus;
      assignedTo: string;
      lockTimestamp: string;
      lockToken: string;
    },
  ): Promise<void>;
  /** Record the outcome of a call and clear the lock. */
  writeDisposition(
    id: string,
    patch: {
      status: LeadStatus;
      notes: string;
      callbackDate: string;
      lastCalledBy: string;
      lastCalledAt: string;
    },
  ): Promise<void>;
  /** Return a lead to the queue: status New, lock and assignee cleared. */
  releaseLock(id: string): Promise<void>;
  /** Overwrite a lead's editable fields (manager action). */
  updateLead(
    id: string,
    patch: Partial<
      Pick<
        Lead,
        "name" | "phone" | "company" | "city" | "source" | "status" | "assignedTo" | "callbackDate"
      >
    >,
  ): Promise<void>;

  // ---- Claim ledger (append-only) ----------------------------------------
  appendClaim(claim: Claim): Promise<void>;
  closeClaim(claimId: string, outcome: string, closedAt: string): Promise<void>;
  listClaims(): Promise<Claim[]>;
  /** Claims that have not been closed yet, optionally for one lead. */
  listOpenClaims(leadId?: string): Promise<Claim[]>;

  // ---- Call logs (append-only) -------------------------------------------
  appendCallLog(log: CallLog): Promise<void>;
  listCallLogs(): Promise<CallLog[]>;

  // ---- Users -------------------------------------------------------------
  listUsers(): Promise<User[]>;
  getUser(email: string): Promise<User | null>;
  upsertUser(user: User): Promise<void>;
  removeUser(email: string): Promise<void>;
}
