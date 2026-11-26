"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHEATS, GROUPS, type Group, searchCheats } from "@/content/cheats";
import { cheatRefs } from "@/content/links";
import { useProgress } from "@/lib/progress";
import { DangerPill } from "@/components/cheats/DangerPill";

export function CheatsIndex() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<Group | "All">("All");
  const [learnedOnly, setLearnedOnly] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const progress = useProgress();

  const learned = useMemo(() => {
    const s = new Set<string>();
    for (const c of CHEATS) if (cheatRefs(c.slug).some((r) => (r.kind === "lesson" ? progress.lessons[r.key]?.done : progress.mistakes[r.key]))) s.add(c.slug);
    return s;
  }, [progress]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    let list = searchCheats(q);
    if (group !== "All") list = list.filter((c) => c.group === group);
    if (learnedOnly) list = list.filter((c) => learned.has(c.slug));
    return list;
  }, [q, group, learnedOnly, learned]);
  const searching = q.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Cheat codes</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {CHEATS.length} commands and ideas. You&apos;ve learned {learned.size} so far in lessons and drills.
          </p>
        </div>
      </div>

      <div className="sticky top-12 z-10 -mx-4 mt-5 bg-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <label htmlFor="cheat-search" className="sr-only">
          Search cheat codes
        </label>
        <div className="relative">
          <input
            id="cheat-search"
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Search: "undo last commit", "stash", "rebase"…'
            autoComplete="off"
            className="h-10 w-full rounded-[var(--radius)] border border-rule-strong bg-surface pl-3 pr-10 text-[14px] outline-none focus:border-[var(--focus)]"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-rule px-1.5 font-mono text-[11px] text-muted">/</kbd>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label="Filter by topic">
          {(["All", ...GROUPS] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={`h-7 rounded-full px-2.5 text-[12.5px] ${group === g ? "bg-ink text-surface" : "bg-surface text-ink-2 ring-1 ring-rule hover:text-ink"}`}
            >
              {g}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2">
            <input type="checkbox" checked={learnedOnly} onChange={(e) => setLearnedOnly(e.target.checked)} className="accent-[var(--lane-0)]" />
            Learned only
          </label>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {results.length} results
      </p>
      {!results.length ? (
        <p className="mt-6 text-[14px] text-ink-2">
          Nothing matches. Try fewer words, or describe what you want to do, like &quot;delete branch&quot;.
        </p>
      ) : searching || group !== "All" ? (
        <CheatList list={results} learned={learned} />
      ) : (
        GROUPS.map((g) => {
          const list = results.filter((c) => c.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="mt-6" aria-labelledby={`g-${g}`}>
              <h2 id={`g-${g}`} className="mb-2 text-[15px] font-semibold">
                {g}
              </h2>
              <CheatList list={list} learned={learned} />
            </section>
          );
        })
      )}
    </div>
  );
}

function CheatList({ list, learned }: { list: typeof CHEATS; learned: Set<string> }) {
  return (
    <ul className="mt-2 divide-y divide-rule overflow-hidden rounded-[var(--radius)] border border-rule bg-surface">
      {list.map((c) => (
        <li key={c.slug}>
          <Link href={`/cheats/${c.slug}`} className="flex flex-col gap-0.5 px-4 py-2.5 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
            <code className="shrink-0 font-mono text-[13px] text-[var(--lane-0)] sm:w-[280px] sm:truncate">{c.command}</code>
            <span className="min-w-0 flex-1 text-[13.5px]">{c.title}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {learned.has(c.slug) && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] text-ok">Learned</span>}
              {c.simulated === false && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted">Not in sandbox</span>}
              {c.danger !== "safe" && <DangerPill danger={c.danger} />}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
