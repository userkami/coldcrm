import type { AgentActivity } from "@/lib/types";

export function AgentTable({ agents }: { agents: AgentActivity[] }) {
  if (agents.length === 0) {
    return (
      <div className="card p-5 text-sm text-ink-dim">No agents yet.</div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-edge px-5 py-3">
        <h2 className="text-sm font-semibold">Agent activity</h2>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-ink-dim">
              <th className="px-5 py-2 font-medium">Agent</th>
              <th className="px-3 py-2 text-right font-medium">Calls</th>
              <th className="px-3 py-2 text-right font-medium">Connected</th>
              <th className="px-3 py-2 text-right font-medium">Interested</th>
              <th className="px-3 py-2 text-right font-medium">Callbacks</th>
              <th className="px-5 py-2 text-right font-medium">Open CB</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr
                key={agent.email}
                className="border-b border-edge/50 last:border-0"
              >
                <td className="px-5 py-2.5">
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-xs text-ink-dim">{agent.email}</p>
                </td>
                <td className="px-3 py-2.5 text-right font-medium">
                  {agent.callsToday}
                </td>
                <td className="px-3 py-2.5 text-right">{agent.connectedToday}</td>
                <td className="px-3 py-2.5 text-right text-good">
                  {agent.interestedToday}
                </td>
                <td className="px-3 py-2.5 text-right text-warn">
                  {agent.callbacksToday}
                </td>
                <td className="px-5 py-2.5 text-right">{agent.openCallbacks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
