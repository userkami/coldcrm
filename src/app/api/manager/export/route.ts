import { requireRoleApi } from "@/lib/auth";
import { getRepository } from "@/lib/repo";
import { failureResponse } from "@/lib/api";

/** Escape a value for CSV: quote when it contains a comma, quote or newline. */
function csvCell(value: string): string {
  const v = value ?? "";
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  // A BOM makes Excel open UTF-8 correctly on Windows.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function GET(request: Request) {
  const auth = await requireRoleApi("MANAGER");
  if ("response" in auth) return auth.response;

  const type = new URL(request.url).searchParams.get("type") ?? "leads";

  try {
    const repo = await getRepository();

    if (type === "calls") {
      const logs = await repo.listCallLogs();
      const csv = toCsv(
        ["timestamp", "leadId", "agentEmail", "agentName", "status", "notes", "callbackDate"],
        logs.map((l) => [
          l.timestamp,
          l.leadId,
          l.agentEmail,
          l.agentName,
          l.status,
          l.notes,
          l.callbackDate,
        ]),
      );
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="call-logs.csv"`,
        },
      });
    }

    const leads = await repo.listLeads();
    const csv = toCsv(
      [
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
      ],
      leads.map((l) => [
        l.id,
        l.name,
        l.phone,
        l.status,
        l.assignedTo,
        l.lockTimestamp,
        l.notes,
        l.callbackDate,
        l.lastCalledBy,
        l.lastCalledAt,
        l.company,
        l.city,
        l.source,
      ]),
    );

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads.csv"`,
      },
    });
  } catch (error) {
    return failureResponse(
      "manager export",
      error,
      "Could not build the export. Please try again.",
    );
  }
}
