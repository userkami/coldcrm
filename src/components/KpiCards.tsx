import type { KpiSummary } from "@/lib/types";

export function KpiCards({ kpis }: { kpis: KpiSummary }) {
  const cards = [
    { label: "Total leads", value: String(kpis.totalLeads), tone: "" },
    { label: "Contacted", value: String(kpis.contacted), tone: "text-brand" },
    { label: "Open", value: String(kpis.open), tone: "text-warn" },
    {
      label: "Conversion",
      value: `${kpis.conversionRate.toFixed(1)}%`,
      tone: "text-good",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="card px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-dim">
            {card.label}
          </p>
          <p className={`mt-1 text-2xl font-semibold ${card.tone}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
