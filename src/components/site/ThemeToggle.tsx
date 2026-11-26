"use client";

import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const read = (): Mode => {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
};

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  const cycle = () => {
    const m = NEXT[mode];
    if (m === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = m;
    try {
      if (m === "system") localStorage.removeItem("bw-theme");
      else localStorage.setItem("bw-theme", m);
    } catch {}
    listeners.forEach((l) => l());
  };
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${LABEL[mode]}. Change theme`}
      title={LABEL[mode]}
      className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
        {mode === "dark" ? (
          <path d="M14.5 12.8A6.5 6.5 0 0 1 7.2 5.5a6.5 6.5 0 1 0 7.3 7.3Z" fill="currentColor" />
        ) : mode === "light" ? (
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="10" cy="10" r="3.4" />
            <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
          </g>
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="6.5" />
            <path d="M10 3.5v13a6.5 6.5 0 0 0 0-13Z" fill="currentColor" />
          </g>
        )}
      </svg>
    </button>
  );
}
