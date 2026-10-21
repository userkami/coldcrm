"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { describeFailure, readJson } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(describeFailure(res, data));
        return;
      }
      router.push((data?.redirectTo as string | undefined) ?? "/agent");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-grid px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-strong/15 text-2xl">
            📞
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Cold CRM</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Sign in to start calling
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-dim"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="input"
              placeholder="agent@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="pin"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-dim"
            >
              PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              required
              className="input tracking-[0.3em]"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-dim">
          Access is by invitation. Contact your manager for a PIN.
        </p>
      </div>
    </main>
  );
}
