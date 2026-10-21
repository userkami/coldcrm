import type { StatusBreakdownEntry } from "@/lib/types";
import { statusLabel } from "@/lib/status";

const BAR: Record<string, string> = {
  New: "bg-sky-400",
  Calling: "bg-amber-400",
  "Connected - Interested": "bg-emerald-400",
  "Connected - Not Interested": "bg-slate-400",
  "Callback Requested": "bg-violet-400",
  "No Answer": "bg-zinc-500",
  "Wrong Number": "bg-rose-400",
};

export function StatusBreakdown({ breakdown }: { breakdown: StatusBreakdownEntry[] }) {
  const max = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold">Status breakdown</h2>
      <div className="mt-4 space-y-3">
        {breakdown.map((entry) => (
          <div key={entry.status}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-dim">{statusLabel(entry.status)}</span>
              <span className="font-medium">
                {entry.count}
                <span className="ml-1.5 text-ink-dim">
                  {entry.percentage.toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${BAR[entry.status] ?? "bg-brand"}`}
                style={{ width: `${(entry.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
