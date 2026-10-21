"use client";

import { useState } from "react";
import type { PublicUser, Role } from "@/lib/types";

type ManagedUser = PublicUser;

export function AgentAdmin({
  users,
  currentEmail,
  onChanged,
}: {
  users: ManagedUser[];
  currentEmail: string;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<Role>("AGENT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [resetting, setResetting] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState("");

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That did not work.");
        return false;
      }
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createAgent(event: React.FormEvent) {
    event.preventDefault();
    const ok = await call("/api/manager/agents", {
      method: "POST",
      body: JSON.stringify({ action: "create", email, name, pin, role }),
    });
    if (ok) {
      setEmail("");
      setName("");
      setPin("");
      setRole("AGENT");
      setNotice("Agent saved.");
      onChanged();
    }
  }

  async function toggleActive(user: ManagedUser) {
    const ok = await call("/api/manager/agents", {
      method: "POST",
      body: JSON.stringify({
        action: user.active ? "deactivate" : "update",
        email: user.email,
        active: !user.active,
        role: user.role,
      }),
    });
    if (ok) {
      setNotice(`${user.name} ${user.active ? "deactivated" : "reactivated"}.`);
      onChanged();
    }
  }

  async function doReset(user: ManagedUser) {
    const ok = await call("/api/manager/agents", {
      method: "POST",
      body: JSON.stringify({ action: "reset-pin", email: user.email, pin: resetPin }),
    });
    if (ok) {
      setResetting(null);
      setResetPin("");
      setNotice(`PIN reset for ${user.name}.`);
      onChanged();
    }
  }

  async function removeAgent(user: ManagedUser) {
    if (
      !confirm(
        `Remove ${user.name}? Their call history is kept, but they will not be able to sign in.`,
      )
    ) {
      return;
    }
    const ok = await call(
      `/api/manager/agents?email=${encodeURIComponent(user.email)}`,
      { method: "DELETE" },
    );
    if (ok) {
      setNotice(`${user.name} removed.`);
      onChanged();
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-edge px-5 py-3">
        <h2 className="text-sm font-semibold">Agents</h2>
      </div>

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-ink-dim">
              <th className="px-5 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-5 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.email} className="border-b border-edge/50 last:border-0">
                <td className="px-5 py-2.5 font-medium">
                  {user.name}
                  {user.email === currentEmail ? (
                    <span className="ml-2 text-xs text-ink-dim">(you)</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-dim">{user.email}</td>
                <td className="px-3 py-2.5 text-xs">
                  {user.role === "MANAGER" ? "Manager" : "Agent"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs ${
                      user.active ? "text-good" : "text-ink-dim"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        user.active ? "bg-good" : "bg-ink-dim/50"
                      }`}
                    />
                    {user.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    {resetting === user.email ? (
                      <div className="flex gap-1.5">
                        <input
                          className="input w-20 py-1 text-xs"
                          placeholder="New PIN"
                          value={resetPin}
                          onChange={(e) => setResetPin(e.target.value)}
                        />
                        <button
                          onClick={() => doReset(user)}
                          disabled={busy}
                          className="btn btn-primary px-2.5 py-1 text-xs"
                        >
                          Set
                        </button>
                        <button
                          onClick={() => {
                            setResetting(null);
                            setResetPin("");
                          }}
                          className="btn btn-ghost px-2.5 py-1 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setResetting(user.email);
                            setResetPin("");
                          }}
                          className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-dim hover:border-brand-strong hover:text-ink"
                        >
                          Reset PIN
                        </button>
                        {user.email !== currentEmail ? (
                          <>
                            <button
                              onClick={() => toggleActive(user)}
                              className="rounded-md border border-edge px-2.5 py-1 text-xs text-ink-dim hover:border-brand-strong hover:text-ink"
                            >
                              {user.active ? "Deactivate" : "Reactivate"}
                            </button>
                            <button
                              onClick={() => removeAgent(user)}
                              className="rounded-md border border-edge px-2.5 py-1 text-xs text-bad/80 hover:border-bad/50 hover:text-bad"
                            >
                              Remove
                            </button>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={createAgent} className="border-t border-edge bg-surface-3/40 p-5">
        <h3 className="text-sm font-semibold">Add an agent</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="email@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="PIN (4-8 digits)"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            inputMode="numeric"
          />
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="AGENT">Agent</option>
            <option value="MANAGER">Manager</option>
          </select>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-bad">{error}</p>
        ) : null}
        {notice ? <p className="mt-3 text-sm text-good">{notice}</p> : null}

        <button type="submit" disabled={busy} className="btn btn-primary mt-4">
          {busy ? "Saving…" : "Add agent"}
        </button>
      </form>
    </div>
  );
}
