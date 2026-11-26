"use client";

import { useSyncExternalStore } from "react";

/** Progress lives only in this browser. Every access is guarded: the site works with storage blocked. */

export interface Progress {
  v: 1;
  lessons: Record<string, { done: boolean; step: number }>;
  mistakes: Record<string, boolean>;
}

const KEY = "bw-progress-v1";
const EMPTY: Progress = { v: 1, lessons: {}, mistakes: {} };
let cache: Progress | null = null;
const listeners = new Set<() => void>();

function load(): Progress {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Progress) : null;
    cache = parsed && parsed.v === 1 ? { ...EMPTY, ...parsed } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function save(p: Progress) {
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
};

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

const noopSubscribe = () => () => {};
/** false during SSR and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function setLessonStep(key: string, step: number) {
  const p = load();
  const cur = p.lessons[key] ?? { done: false, step: 0 };
  if (cur.step === step) return;
  save({ ...p, lessons: { ...p.lessons, [key]: { ...cur, step } } });
}

export function completeLesson(key: string) {
  const p = load();
  if (p.lessons[key]?.done) return;
  save({ ...p, lessons: { ...p.lessons, [key]: { done: true, step: 0 } } });
}

export function completeMistake(slug: string) {
  const p = load();
  if (p.mistakes[slug]) return;
  save({ ...p, mistakes: { ...p.mistakes, [slug]: true } });
}

export function resetProgress() {
  save(EMPTY);
}
