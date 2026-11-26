"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { mutate } from "@/engine/run";
import type { World } from "@/engine/types";
import type { Sandbox } from "@/lib/useSandbox";
import { columnOrder, newLaneMemory, type LaneMemory } from "@/viz/layout";
import { GraphView } from "@/components/graph/GraphView";
import { Terminal, type TerminalHandle } from "@/components/terminal/Terminal";
import { FilesPanel } from "@/components/files/FilesPanel";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { RebaseEditor } from "@/components/rebase/RebaseEditor";

export function describeEvents(sb: Sandbox): string {
  const e = sb.lastEvents;
  const parts: string[] = [];
  const commits = e.filter((x) => x.type === "commit").length;
  if (commits) parts.push(`${commits} new commit${commits > 1 ? "s" : ""}`);
  for (const x of e) {
    if (x.type === "ref" && x.to && x.from) parts.push(`${x.ref} moved`);
    else if (x.type === "ref" && x.to && !x.from) parts.push(`${x.ref} created`);
    else if (x.type === "ref" && !x.to) parts.push(`${x.ref} deleted`);
    else if (x.type === "transfer") parts.push(`${x.ids.length} commit${x.ids.length > 1 ? "s" : ""} copied from ${x.from} to ${x.to}`);
    else if (x.type === "conflict") parts.push(`conflict in ${x.paths.join(", ")}`);
  }
  return [...new Set(parts)].join("; ");
}

export function Workbench({
  sb,
  side = true,
  terminalHeight = "h-72",
  toolbar,
  compact,
}: {
  sb: Sandbox;
  side?: boolean;
  terminalHeight?: string;
  toolbar?: ReactNode;
  compact?: boolean;
}) {
  const world = sb.world;
  const term = useRef<TerminalHandle>(null);
  const memories = useRef<Record<string, LaneMemory>>({});
  const mem = (k: string) => (memories.current[k] ??= newLaneMemory());
  const [showLost, setShowLost] = useState(true);
  const hasGh = Object.keys(world.github.repos).length > 0;
  const [tab, setTab] = useState<"files" | "github">("files");
  const ghKeys = Object.keys(world.github.repos).sort((a, b) => (a === "upstream" ? -1 : b === "upstream" ? 1 : a.localeCompare(b)));
  const cols = useMemo(() => columnOrder(Object.values(world.repos)), [world]);
  const local = world.repos[world.cwd];
  const announcement = describeEvents(sb);

  const saveFile = (path: string, content: string | null) => {
    sb.apply(
      mutate(world, (d) => {
        const r = d.repos[d.cwd];
        if (content === null) delete r.workdir[path];
        else r.workdir[path] = content;
      }),
      content === null ? `# deleted ${path} in your editor` : `# saved ${path} in your editor`,
    );
  };

  return (
    <div className={`grid min-h-0 gap-3 ${side ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="rounded-[var(--radius)] border border-rule bg-surface">
          <div className="flex flex-wrap items-center gap-1 border-b border-rule px-2 py-1.5">
            {toolbar}
            <span className="flex-1" />
            <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[12px] text-ink-2" title="Commits no branch points to any more. Git keeps them for a while and the reflog can bring them back.">
              <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} className="accent-[var(--lane-0)]" />
              Show unreachable commits
            </label>
            <button type="button" onClick={sb.undo} disabled={!sb.past.length} className="h-7 rounded-md px-2 text-[12px] text-ink-2 hover:bg-surface-2 disabled:opacity-40" title="Step back one change (sandbox only)">
              Undo
            </button>
            <button type="button" onClick={sb.redo} disabled={!sb.future.length} className="h-7 rounded-md px-2 text-[12px] text-ink-2 hover:bg-surface-2 disabled:opacity-40">
              Redo
            </button>
          </div>
          <div className="divide-y divide-rule">
            {ghKeys.map((k) => {
              const g = world.github.repos[k];
              return (
                <GraphView
                  key={k}
                  repo={world.repos[k]}
                  cols={cols}
                  memory={mem(k)}
                  showUnreachable={false}
                  title={`On GitHub: ${g.owner}/${g.name}${g.forkOf ? " (your fork)" : k === "upstream" ? " (the original)" : ""}`}
                  emptyText="Empty repository. Push something to fill it."
                  compact
                />
              );
            })}
            <GraphView
              repo={local}
              cols={cols}
              memory={mem("local")}
              showUnreachable={showLost}
              title={hasGh ? "On your computer" : "Your repository"}
              emptyText={local.initialized ? "No commits yet. Add a file and commit it." : "Not a Git repository yet. Run git init."}
              onNodeClick={(id) => term.current?.insert(id.slice(0, 7))}
              compact={compact}
            />
          </div>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </div>
        <Terminal ref={term} world={world} entries={sb.entries} onSubmit={sb.exec} height={terminalHeight} />
      </div>
      {side && (
        <aside className="flex min-w-0 flex-col rounded-[var(--radius)] border border-rule bg-surface lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto scroll-thin">
          <div role="tablist" aria-label="Side panel" className="flex gap-1 border-b border-rule p-1.5">
            {(["files", "github"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`h-7 flex-1 rounded-md text-[12.5px] ${tab === t ? "bg-info-soft font-medium text-ink" : "text-ink-2 hover:bg-surface-2"}`}
              >
                {t === "files" ? "Files" : `GitHub${world.github.prs.some((p) => p.state === "open") ? ` (${world.github.prs.filter((p) => p.state === "open").length})` : ""}`}
              </button>
            ))}
          </div>
          <div role="tabpanel">{tab === "files" ? <FilesPanel repo={local} onSave={saveFile} /> : <GitHubPanel world={world} exec={sb.exec} apply={sb.apply} />}</div>
        </aside>
      )}
      {sb.rebaseEditor && <RebaseEditor repo={local} steps={sb.rebaseEditor.steps} label={sb.rebaseEditor.label} onStart={sb.runTodo} onCancel={sb.closeEditor} />}
    </div>
  );
}

export type { World };
