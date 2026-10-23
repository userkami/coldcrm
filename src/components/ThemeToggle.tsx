"use client";

import { useState, useEffect } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const stored = localStorage.getItem("coldcrm-theme");
    const isDark = stored === null ? true : stored === "dark";
    setDark(isDark);
    root.classList.toggle("theme-dark", isDark);
    root.classList.toggle("theme-light", !isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("theme-dark", next);
    document.documentElement.classList.toggle("theme-light", !next);
    localStorage.setItem("coldcrm-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light" : "Switch to dark"}
      title={dark ? "Light mode" : "Dark mode"}
      className="rounded-lg border border-edge bg-surface-3/60 px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-brand-strong hover:text-ink"
    >
      {dark ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
