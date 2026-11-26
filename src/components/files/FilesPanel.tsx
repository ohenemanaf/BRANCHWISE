"use client";

import { useState } from "react";
import { hasConflictMarkers } from "@/engine/diff";
import { headTree, ignored, status } from "@/engine/repo";
import type { Repo } from "@/engine/types";
import { Dialog } from "@/components/ui/Dialog";

type Chip = { text: string; tone: "ok" | "bad" | "warn" | "muted" | "info" };

const CHIP: Record<Chip["tone"], string> = {
  ok: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  muted: "bg-surface-2 text-muted",
  info: "bg-info-soft text-[var(--lane-0)]",
};

export function FilesPanel({ repo, onSave }: { repo: Repo; onSave: (path: string, content: string | null) => void }) {
  const [editing, setEditing] = useState<{ path: string; content: string; isNew: boolean } | null>(null);
  if (!repo.initialized && !Object.keys(repo.workdir).length)
    return <p className="px-3 py-4 text-[13px] text-muted">No project folder yet. Try <code className="inline-code">git init</code> or <code className="inline-code">git clone &lt;url&gt;</code>.</p>;

  const st = status(repo);
  const head = headTree(repo);
  const paths = [...new Set([...Object.keys(repo.workdir), ...Object.keys(repo.index), ...Object.keys(head), ...st.unmerged])].sort();
  const stagedMap = new Map(st.staged.map((s) => [s.path, s.kind]));
  const unstagedMap = new Map(st.unstaged.map((s) => [s.path, s.kind]));

  const rows = paths.map((p) => {
    const chips: Chip[] = [];
    if (st.unmerged.includes(p)) chips.push({ text: hasConflictMarkers(repo.workdir[p] ?? "") ? "conflict" : "resolved, not added", tone: "bad" });
    else {
      const s = stagedMap.get(p);
      const u = unstagedMap.get(p);
      if (st.untracked.includes(p)) chips.push({ text: "untracked", tone: "warn" });
      if (s) chips.push({ text: `staged: ${s === "new file" ? "new" : s}`, tone: "ok" });
      if (u) chips.push({ text: u === "deleted" ? "deleted" : "modified", tone: "bad" });
      if (!s && !u && !st.untracked.includes(p)) chips.push(ignored(repo, p) && !(p in repo.index) ? { text: "ignored", tone: "muted" } : { text: "committed", tone: "muted" });
    }
    return { p, chips, inWorkdir: p in repo.workdir };
  });

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <h3 className="text-[12px] font-medium text-ink-2">Files in the project folder</h3>
        <button type="button" className="rounded-md px-2 py-1 text-[12px] text-[var(--lane-0)] hover:bg-info-soft" onClick={() => setEditing({ path: "", content: "", isNew: true })}>
          New file
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 pb-3 text-[13px] text-muted">Empty folder. Make a file with <code className="inline-code">echo &quot;hi&quot; &gt; notes.txt</code>.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((r) => (
            <li key={r.p}>
              <button
                type="button"
                disabled={!r.inWorkdir}
                onClick={() => setEditing({ path: r.p, content: repo.workdir[r.p] ?? "", isNew: false })}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2 disabled:cursor-default disabled:opacity-60"
                title={r.inWorkdir ? `Edit ${r.p}` : `${r.p} is deleted in the working folder`}
              >
                <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${r.inWorkdir ? "" : "line-through"}`}>{r.p}</span>
                {r.chips.map((c) => (
                  <span key={c.text} className={`shrink-0 rounded-full px-1.5 py-px text-[11px] ${CHIP[c.tone]}`}>
                    {c.text}
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-3 py-2 text-[11.5px] text-muted">Click a file to edit it, the way you would in your code editor. Saving changes the working folder only. Git notices it in <code className="inline-code">git status</code>.</p>
      {editing && (
        <FileEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(path, content) => {
            onSave(path, content);
            setEditing(null);
          }}
          onDelete={(path) => {
            onSave(path, null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function FileEditor({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: { path: string; content: string; isNew: boolean };
  onClose: () => void;
  onSave: (path: string, content: string) => void;
  onDelete: (path: string) => void;
}) {
  const [path, setPath] = useState(initial.path);
  const [content, setContent] = useState(initial.content);
  const conflict = hasConflictMarkers(content);
  const valid = /^[\w.\-/]+$/.test(path) && !path.startsWith("/") && !path.includes("..");
  return (
    <Dialog title={initial.isNew ? "New file" : `Edit ${initial.path}`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(path, content.endsWith("\n") || !content ? content : content + "\n");
        }}
      >
        {initial.isNew && (
          <label className="flex flex-col gap-1 text-[12.5px]">
            <span className="text-ink-2">File name</span>
            <input
              autoFocus
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="notes.txt or src/app.js"
              className="h-9 rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-2.5 font-mono text-[12.5px] outline-none focus:border-[var(--focus)]"
            />
          </label>
        )}
        {conflict && (
          <p className="rounded-[var(--radius-sm)] bg-bad-soft px-3 py-2 text-[12.5px] text-bad">
            This file has conflict markers. Keep the lines you want, delete the <code className="inline-code">&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code className="inline-code">=======</code> and <code className="inline-code">&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> lines, save, then <code className="inline-code">git add</code> the file.
          </p>
        )}
        <textarea
          autoFocus={!initial.isNew}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          spellCheck={false}
          aria-label="File contents"
          className="min-h-48 resize-y rounded-[var(--radius-sm)] border border-rule-strong bg-surface-2 p-2.5 font-mono text-[12.5px] leading-relaxed outline-none focus:border-[var(--focus)]"
        />
        <div className="flex items-center gap-2">
          {!initial.isNew && (
            <button type="button" onClick={() => onDelete(initial.path)} className="h-9 rounded-[var(--radius-sm)] px-3 text-[13px] text-bad hover:bg-bad-soft">
              Delete file
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-9 rounded-[var(--radius-sm)] px-3 text-[13px] text-ink-2 hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" disabled={!valid} className="h-9 rounded-[var(--radius-sm)] bg-[var(--lane-0)] px-3.5 text-[13px] font-medium text-white disabled:opacity-50">
            Save file
          </button>
        </div>
      </form>
    </Dialog>
  );
}
