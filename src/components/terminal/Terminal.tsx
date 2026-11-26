"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { gitCommands } from "@/engine/run";
import type { Tone, World } from "@/engine/types";
import type { TermEntry } from "@/lib/useSandbox";

const TONE: Record<Tone, string> = {
  normal: "text-[var(--term-ink)]",
  error: "text-[var(--term-bad)]",
  hint: "text-[var(--term-hint)]",
  success: "text-[var(--term-ok)]",
  muted: "text-[var(--term-muted)]",
  warn: "text-[var(--term-warn)]",
};

function prompt(world: World) {
  const repo = world.repos[world.cwd];
  if (!repo.initialized) return { where: "project", branch: "" };
  let b = repo.head.kind === "branch" ? repo.head.name : repo.head.id.slice(0, 7) + "…";
  if (repo.op) b += `|${repo.op.kind === "merge" ? "MERGING" : repo.op.kind === "rebase" ? "REBASE" : repo.op.kind === "revert" ? "REVERTING" : "CHERRY-PICKING"}`;
  if (repo.bisect) b += "|BISECTING";
  return { where: "project", branch: b };
}

const GH_WORDS = ["gh repo fork", "gh repo create", "gh repo clone", "gh pr create", "gh pr list", "gh pr view", "gh pr review", "gh pr merge", "gh pr checkout", "gh pr checks", "gh run list", "gh run view"];

function complete(input: string, world: World): string[] {
  const repo = world.repos[world.cwd];
  const words = input.split(/\s+/);
  const last = words[words.length - 1];
  if (words.length === 1) return ["git", "gh", "ls", "cat", "echo", "touch", "rm", "npm test", "clear"].filter((c) => c.startsWith(last));
  if (words[0] === "gh") return GH_WORDS.filter((g) => g.startsWith(input)).map((g) => g.split(" ").slice(words.length - 1).join(" "));
  if (words[0] === "git" && words.length === 2) return Object.keys(gitCommands).filter((c) => c.startsWith(last));
  const refs = [
    ...Object.keys(repo.branches),
    ...Object.entries(repo.remoteRefs).flatMap(([r, bs]) => Object.keys(bs).map((b) => `${r}/${b}`)),
    ...Object.keys(repo.tags),
    ...Object.keys(repo.remotes),
  ];
  const files = Object.keys({ ...repo.workdir, ...repo.index });
  return [...new Set([...refs, ...files])].filter((x) => x.startsWith(last)).sort();
}

export interface TerminalHandle {
  focus(): void;
  insert(text: string): void;
}

export const Terminal = forwardRef<TerminalHandle, {
  world: World;
  entries: TermEntry[];
  onSubmit: (line: string) => void;
  height?: string;
  placeholder?: string;
  disabled?: boolean;
}>(function Terminal({ world, entries, onSubmit, height = "h-64", placeholder, disabled }, ref) {
  const [value, setValue] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState<number | null>(null);
  const [suggest, setSuggest] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    insert: (t: string) => {
      setValue((v) => (v && !v.endsWith(" ") ? v + " " : v) + t);
      input.current?.focus();
    },
  }));

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [entries]);

  const p = prompt(world);
  const submit = () => {
    onSubmit(value);
    if (value.trim()) setHist((h) => [...h.filter((x) => x !== value), value].slice(-100));
    setValue("");
    setHi(null);
    setSuggest([]);
  };

  return (
    <div
      className={`flex ${height} flex-col overflow-hidden rounded-[var(--radius)] bg-term-bg font-mono text-[12.5px] leading-[1.55]`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (!window.getSelection()?.toString()) input.current?.focus();
      }}
    >
      <div ref={scroll} className="flex-1 overflow-y-auto px-3 pt-2.5 pb-1 scroll-thin" role="log" aria-live="polite" aria-label="Terminal output">
        {entries.map((e) => (
          <div key={e.id} className="mb-1">
            {e.input !== null && (
              <div className="text-[var(--term-ink)]">
                <span className="text-[var(--term-ok)]">{p.where}</span>
                <span className="text-[var(--term-muted)]"> $ </span>
                <span className="whitespace-pre-wrap break-words">{e.input}</span>
              </div>
            )}
            {e.lines.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-words ${TONE[l.tone]}`}>
                {l.text || " "}
              </div>
            ))}
          </div>
        ))}
      </div>
      {suggest.length > 1 && (
        <div className="flex flex-wrap gap-x-3 px-3 text-[11.5px] text-[var(--term-muted)]" aria-live="polite">
          {suggest.slice(0, 12).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-1.5 border-t border-white/5 px-3 py-2 focus-within:bg-white/[0.04]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) submit();
        }}
      >
        <label htmlFor="term-input" className="shrink-0 text-[var(--term-muted)]">
          <span className="text-[var(--term-ok)]">{p.where}</span>
          {p.branch && <span className="text-[var(--term-hint)]"> ({p.branch})</span>} $
        </label>
        <input
          id="term-input"
          ref={input}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            setSuggest([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && hist.length) {
              e.preventDefault();
              const i = hi === null ? hist.length - 1 : Math.max(0, hi - 1);
              setHi(i);
              setValue(hist[i]);
            } else if (e.key === "ArrowDown" && hi !== null) {
              e.preventDefault();
              const i = hi + 1;
              if (i >= hist.length) {
                setHi(null);
                setValue("");
              } else {
                setHi(i);
                setValue(hist[i]);
              }
            } else if (e.key === "Tab") {
              const opts = complete(value, world);
              if (!opts.length) return;
              e.preventDefault();
              const words = value.split(/\s+/);
              const last = words[words.length - 1];
              let common = opts[0];
              for (const o of opts) while (!o.startsWith(common)) common = common.slice(0, -1);
              if (common.length > last.length || opts.length === 1) {
                words[words.length - 1] = opts.length === 1 ? opts[0] + " " : common;
                setValue(words.join(" "));
                setSuggest([]);
              } else setSuggest(opts);
            } else if (e.key === "l" && e.ctrlKey) {
              e.preventDefault();
              onSubmit("clear");
            }
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder ?? "type a command, e.g. git status"}
          aria-label="Command"
          className="min-w-0 flex-1 bg-transparent text-[var(--term-ink)] caret-[var(--term-ok)] outline-none focus-visible:outline-none placeholder:text-[var(--term-muted)]/70"
        />
      </form>
    </div>
  );
});
