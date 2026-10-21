"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-brand-strong hover:text-ink"
    >
      Sign out
    </button>
  );
}
