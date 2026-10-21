import "server-only";
import { google, type drive_v3, type sheets_v4 } from "googleapis";
import type { CallLog, Claim, Lead, LeadStatus, User } from "../types";
import { normalizeStatus } from "../status";
import type { LeadsRepository } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

/** Tab names, fixed so the repository can look up grid ids by name. */
const TABS = {
  leads: "Leads",
  users: "Users",
  callLogs: "CallLogs",
  claims: "Claims",
} as const;

/** Header row of the Leads tab: the spec's ten columns, then our additions. */
const LEAD_HEADERS = [
  "id",
  "name",
  "phone",
  "status",
  "assignedTo",
  "lockTimestamp",
  "notes",
  "callbackDate",
  "lastCalledBy",
  "lastCalledAt",
  "company",
  "city",
  "source",
  "lockToken",
] as const;

const USER_HEADERS = ["email", "name", "pin", "role", "active"] as const;
const CALL_LOG_HEADERS = [
  "timestamp",
  "leadId",
  "agentEmail",
  "agentName",
  "status",
  "notes",
  "callbackDate",
] as const;
const CLAIM_HEADERS = [
  "claimId",
  "leadId",
  "agentEmail",
  "claimedAt",
  "closedAt",
  "outcome",
] as const;

interface TabMeta {
  sheetId: number;
  /** Header name -> zero-based column index. */
  columns: Record<string, number>;
  /** Number of columns to read. */
  width: number;
}

/**
 * Google Sheets persistence.
 *
 * Three rules shape every write here, all of them consequences of the Sheets
 * API having no transactions:
 *
 *  1. Never write a whole row. A range write overwrites every cell in the
 *     range, so it would clobber a concurrent write to a different column of
 *     the same row. Every write here targets individual cells.
 *  2. Batch the cells of one logical operation into a single
 *     `spreadsheets.batchUpdate`, which Google documents as applying the
 *     requests atomically.
 *  3. Ledger and log tabs are append-only, written with `values.append`, so
 *     two simultaneous appends never lose each other.
 */
export class SheetsRepository implements LeadsRepository {
  private sheetsApi: sheets_v4.Sheets | null = null;
  private driveApi: drive_v3.Drive | null = null;
  private tabMeta: Map<string, TabMeta> | null = null;
  private leadCache: { at: number; leads: Lead[] } | null = null;
  private readonly spreadsheetId: string;
  private readonly cacheTtlMs: number;

  // Written as explicit fields rather than parameter properties: Node's
  // type-stripping loader (used by the test runner) does not support them.
  constructor(spreadsheetId: string, cacheTtlMs = 5000) {
    this.spreadsheetId = spreadsheetId;
    this.cacheTtlMs = cacheTtlMs;
  }

  // ---- Client setup ------------------------------------------------------

  private async api(): Promise<sheets_v4.Sheets> {
    if (this.sheetsApi) return this.sheetsApi;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    if (!clientEmail || !rawKey) {
      throw new Error(
        "GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY are required for the Sheets backend.",
      );
    }
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        // A key pasted into its own env var carries literal "\n" sequences
        // rather than real newlines; the JWT signer needs the real thing.
        private_key: rawKey.replace(/\\n/g, "\n"),
      },
      scopes: SCOPES,
    });
    this.sheetsApi = google.sheets({ version: "v4", auth });
    return this.sheetsApi;
  }

  private async drive(): Promise<drive_v3.Drive> {
    if (this.driveApi) return this.driveApi;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    if (!clientEmail || !rawKey) {
      throw new Error(
        "GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY are required for the Sheets backend.",
      );
    }
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: rawKey.replace(/\\n/g, "\n"),
      },
      scopes: SCOPES,
    });
    this.driveApi = google.drive({ version: "v3", auth });
    return this.driveApi;
  }

  // ---- Tab metadata ------------------------------------------------------

  private async tabs(): Promise<Map<string, TabMeta>> {
    if (this.tabMeta) return this.tabMeta;
    const sheets = await this.api();
    const res = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      includeGridData: false,
    });

    const byName = new Map<string, TabMeta>();
    for (const sheet of res.data.sheets ?? []) {
      const title = sheet.properties?.title;
      if (!title) continue;
      const headers =
        title === TABS.leads
          ? (LEAD_HEADERS as readonly string[])
          : title === TABS.users
            ? (USER_HEADERS as readonly string[])
            : title === TABS.callLogs
              ? (CALL_LOG_HEADERS as readonly string[])
              : title === TABS.claims
                ? (CLAIM_HEADERS as readonly string[])
                : [];
      const columns: Record<string, number> = {};
      headers.forEach((h, i) => {
        columns[h] = i;
      });
      byName.set(title, {
        sheetId: sheet.properties!.sheetId!,
        columns,
        width: headers.length,
      });
    }
    this.tabMeta = byName;
    return byName;
  }

  private async tab(title: string): Promise<TabMeta> {
    const tabs = await this.tabs();
    const meta = tabs.get(title);
    if (!meta) {
      throw new Error(
        `Tab "${title}" not found in spreadsheet ${this.spreadsheetId}. Run scripts/bootstrap-sheet.mjs to create it.`,
      );
    }
    return meta;
  }

  // ---- Low-level helpers -------------------------------------------------

  private async readRows(
    title: string,
  ): Promise<string[][]> {
    const meta = await this.tab(title);
    const sheets = await this.api();
    const lastCol = columnLetter(meta.width - 1);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${title}'!A:${lastCol}`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    return (res.data.values ?? []) as string[][];
  }

  /**
   * Write a set of cells in one atomic batch. `cells` is a list of
   * { column, row, value } where `column` is a header name and `row` is the
   * zero-based sheet row index (0 is the header row, so data starts at 1).
   */
  private async writeCells(
    title: string,
    cells: { column: string; row: number; value: string }[],
  ): Promise<void> {
    if (cells.length === 0) return;
    const meta = await this.tab(title);
    const sheets = await this.api();

    const requests = cells.map((cell) => {
      const colIndex = meta.columns[cell.column];
      if (colIndex === undefined) {
        throw new Error(`Unknown column "${cell.column}" on tab "${title}".`);
      }
      return {
        updateCells: {
          start: {
            sheetId: meta.sheetId,
            rowIndex: cell.row,
            columnIndex: colIndex,
          },
          rows: [
            {
              values: [
                { userEnteredValue: { stringValue: cell.value ?? "" } },
              ],
            },
          ],
          fields: "userEnteredValue",
        },
      };
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests },
    });
  }

  /** Append a row to an append-only tab. */
  private async appendRow(title: string, values: string[]): Promise<void> {
    const sheets = await this.api();
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [values] },
    });
  }

  // ---- Leads -------------------------------------------------------------

  async listLeads(): Promise<Lead[]> {
    const now = Date.now();
    if (this.leadCache && now - this.leadCache.at < this.cacheTtlMs) {
      return this.leadCache.leads;
    }
    const rows = await this.readRows(TABS.leads);
    const leads: Lead[] = [];
    for (let i = 1; i < rows.length; i++) {
      const lead = rowToLead(rows[i]);
      if (lead) leads.push(lead);
    }
    this.leadCache = { at: now, leads };
    return leads;
  }

  async getLead(id: string): Promise<Lead | null> {
    const leads = await this.listLeads();
    return leads.find((l) => l.id === id) ?? null;
  }

  /** Invalidate the cached tab read after a write. */
  private invalidate(): void {
    this.leadCache = null;
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
    const row = await this.rowIndexOfLead(id);
    if (row === null) throw new Error(`Lead ${id} not found.`);
    await this.writeCells(TABS.leads, [
      { column: "status", row, value: patch.status },
      { column: "assignedTo", row, value: patch.assignedTo },
      { column: "lockTimestamp", row, value: patch.lockTimestamp },
      { column: "lockToken", row, value: patch.lockToken },
    ]);
    this.invalidate();
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
    const row = await this.rowIndexOfLead(id);
    if (row === null) throw new Error(`Lead ${id} not found.`);
    // Current notes are read first so the agent's remark is appended to the
    // history rather than replacing it.
    const current = await this.getLead(id);
    const combinedNotes = current?.notes
      ? `${current.notes}\n${patch.notes}`.trim()
      : patch.notes;

    await this.writeCells(TABS.leads, [
      { column: "status", row, value: patch.status },
      { column: "notes", row, value: combinedNotes },
      { column: "callbackDate", row, value: patch.callbackDate },
      { column: "lastCalledBy", row, value: patch.lastCalledBy },
      { column: "lastCalledAt", row, value: patch.lastCalledAt },
      // Release the lock in the same atomic write as the disposition.
      { column: "assignedTo", row, value: "" },
      { column: "lockTimestamp", row, value: "" },
      { column: "lockToken", row, value: "" },
    ]);
    this.invalidate();
  }

  async releaseLock(id: string): Promise<void> {
    const row = await this.rowIndexOfLead(id);
    if (row === null) throw new Error(`Lead ${id} not found.`);
    await this.writeCells(TABS.leads, [
      { column: "status", row, value: "New" },
      { column: "assignedTo", row, value: "" },
      { column: "lockTimestamp", row, value: "" },
      { column: "lockToken", row, value: "" },
    ]);
    this.invalidate();
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
    const row = await this.rowIndexOfLead(id);
    if (row === null) throw new Error(`Lead ${id} not found.`);

    const cells: { column: string; row: number; value: string }[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      cells.push({ column: key, row, value: String(value) });
    }
    // Requeuing a lead must also drop its lock, otherwise it stays
    // unclaimable until the old lock expires.
    if (patch.status === "New") {
      cells.push({ column: "lockToken", row, value: "" });
      cells.push({ column: "lockTimestamp", row, value: "" });
      cells.push({ column: "assignedTo", row, value: "" });
    }
    await this.writeCells(TABS.leads, cells);
    this.invalidate();
  }

  private async rowIndexOfLead(id: string): Promise<number | null> {
    const rows = await this.readRows(TABS.leads);
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] ?? "") === id) return i;
    }
    return null;
  }

  // ---- Claims ------------------------------------------------------------

  async appendClaim(claim: Claim): Promise<void> {
    await this.appendRow(TABS.claims, [
      claim.claimId,
      claim.leadId,
      claim.agentEmail,
      claim.claimedAt,
      claim.closedAt ?? "",
      claim.outcome ?? "",
    ]);
  }

  async closeClaim(claimId: string, outcome: string, closedAt: string): Promise<void> {
    const rows = await this.readRows(TABS.claims);
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] ?? "") === claimId) {
        await this.writeCells(TABS.claims, [
          { column: "closedAt", row: i, value: closedAt },
          { column: "outcome", row: i, value: outcome },
        ]);
        return;
      }
    }
  }

  async listClaims(): Promise<Claim[]> {
    const rows = await this.readRows(TABS.claims);
    const claims: Claim[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      claims.push({
        claimId: row[0] ?? "",
        leadId: row[1] ?? "",
        agentEmail: row[2] ?? "",
        claimedAt: row[3] ?? "",
        closedAt: row[4] ?? "",
        outcome: row[5] ?? "",
      });
    }
    return claims;
  }

  async listOpenClaims(leadId?: string): Promise<Claim[]> {
    const all = await this.listClaims();
    return all.filter(
      (c) => !c.closedAt && (leadId === undefined || c.leadId === leadId),
    );
  }

  // ---- Call logs ---------------------------------------------------------

  async appendCallLog(log: CallLog): Promise<void> {
    await this.appendRow(TABS.callLogs, [
      log.timestamp,
      log.leadId,
      log.agentEmail,
      log.agentName,
      log.status,
      log.notes,
      log.callbackDate,
    ]);
  }

  async listCallLogs(): Promise<CallLog[]> {
    const rows = await this.readRows(TABS.callLogs);
    const logs: CallLog[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      logs.push({
        timestamp: row[0] ?? "",
        leadId: row[1] ?? "",
        agentEmail: row[2] ?? "",
        agentName: row[3] ?? "",
        status: normalizeStatus(row[4]),
        notes: row[5] ?? "",
        callbackDate: row[6] ?? "",
      });
    }
    return logs;
  }

  // ---- Users -------------------------------------------------------------

  async listUsers(): Promise<User[]> {
    const rows = await this.readRows(TABS.users);
    const users: User[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      users.push({
        email: (row[0] ?? "").trim().toLowerCase(),
        name: row[1] ?? "",
        pin: row[2] ?? "",
        role: row[3] === "MANAGER" ? "MANAGER" : "AGENT",
        active: String(row[4] ?? "TRUE").toLowerCase() !== "false",
      });
    }
    return users;
  }

  async getUser(email: string): Promise<User | null> {
    const key = email.trim().toLowerCase();
    const users = await this.listUsers();
    return users.find((u) => u.email === key) ?? null;
  }

  async upsertUser(user: User): Promise<void> {
    const key = user.email.trim().toLowerCase();
    const rows = await this.readRows(TABS.users);
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] ?? "").trim().toLowerCase() === key) {
        await this.writeCells(TABS.users, [
          { column: "email", row: i, value: key },
          { column: "name", row: i, value: user.name },
          { column: "pin", row: i, value: user.pin },
          { column: "role", row: i, value: user.role },
          { column: "active", row: i, value: user.active ? "TRUE" : "FALSE" },
        ]);
        return;
      }
    }
    await this.appendRow(TABS.users, [
      key,
      user.name,
      user.pin,
      user.role,
      user.active ? "TRUE" : "FALSE",
    ]);
  }

  async removeUser(email: string): Promise<void> {
    const key = email.trim().toLowerCase();
    const rows = await this.readRows(TABS.users);
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] ?? "").trim().toLowerCase() === key) {
        // Deactivate rather than delete: the agent's historical call logs
        // keep pointing at a real person.
        await this.writeCells(TABS.users, [
          { column: "active", row: i, value: "FALSE" },
        ]);
        return;
      }
    }
  }
}

// ---- Module helpers -----------------------------------------------------

/** Zero-based column index -> spreadsheet column letter (0 -> A, 26 -> AA). */
function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Map a sheet row to a Lead, by header position rather than fixed offsets. */
function rowToLead(row: string[]): Lead | null {
  if (!row || !row[0]) return null;
  const at = (i: number) => (row[i] ?? "").toString();
  return {
    id: at(0),
    name: at(1),
    phone: at(2),
    status: normalizeStatus(at(3)),
    assignedTo: at(4),
    lockTimestamp: at(5),
    notes: at(6),
    callbackDate: at(7),
    lastCalledBy: at(8),
    lastCalledAt: at(9),
    company: at(10),
    city: at(11),
    source: at(12),
    lockToken: at(13),
  };
}
