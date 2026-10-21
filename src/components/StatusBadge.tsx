import type { LeadStatus } from "@/lib/types";
import { statusLabel } from "@/lib/status";

const TONE: Record<LeadStatus, string> = {
  New: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Calling: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Connected - Interested": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Connected - Not Interested": "bg-slate-500/15 text-slate-300 border-slate-500/30",
  "Callback Requested": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "No Answer": "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  "Wrong Number": "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}
