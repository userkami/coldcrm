import type { Lead } from "@/lib/types";
import { formatPhone, telHref } from "@/lib/phone";

export function LeadCard({ lead }: { lead: Lead }) {
  const href = telHref(lead.phone);
  const subtitle = [lead.company, lead.city].filter(Boolean).join(" · ");

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-edge bg-surface-3/60 px-5 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">
          Calling now
        </span>
      </div>

      <div className="px-5 py-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{lead.name}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink-dim">{subtitle}</p>
        ) : null}
        {lead.source ? (
          <p className="mt-1 text-xs text-ink-dim/70">{lead.source}</p>
        ) : null}

        <p className="mt-4 font-mono text-lg tracking-wide text-ink">
          {formatPhone(lead.phone)}
        </p>

        {href ? (
          <a
            href={href}
            className="btn btn-primary mt-5 w-full py-4 text-base"
            aria-label={`Call ${lead.name} at ${lead.phone}`}
          >
            <span aria-hidden>📞</span>
            Call {lead.name.split(" ")[0]}
          </a>
        ) : (
          <div className="mt-5 rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            This lead has no usable phone number. Skip to the next one.
          </div>
        )}
      </div>

      {lead.notes ? (
        <div className="border-t border-edge px-5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">
            Previous notes
          </p>
          <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-sm text-ink-dim scroll-thin">
            {lead.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
