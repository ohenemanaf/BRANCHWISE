"use client";

import { Reorder, useDragControls } from "motion/react";
import { useState } from "react";
import type { RebaseAction, RebaseStep, Repo } from "@/engine/types";
import { Dialog } from "@/components/ui/Dialog";

const ACTIONS: { value: RebaseAction; label: string; help: string }[] = [
  { value: "pick", label: "pick", help: "keep the commit as it is" },
  { value: "reword", label: "reword", help: "keep it, change the message" },
  { value: "squash", label: "squash", help: "merge into the commit above, combine messages" },
  { value: "fixup", label: "fixup", help: "merge into the commit above, drop this message" },
  { value: "drop", label: "drop", help: "remove the commit" },
];

type Row = RebaseStep & { key: string };

export function RebaseEditor({ repo, steps, label, onStart, onCancel }: { repo: Repo; steps: RebaseStep[]; label: string; onStart: (s: RebaseStep[]) => void; onCancel: () => void }) {
  const [rows, setRows] = useState<Row[]>(steps.map((s) => ({ ...s, key: s.id, message: repo.commits[s.id].message })));
  const firstReal = rows.find((r) => r.action !== "drop");
  const invalid = firstReal && (firstReal.action === "squash" || firstReal.action === "fixup");
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const start = () => {
    const out: RebaseStep[] = [];
    for (const r of rows) {
      const original = repo.commits[r.id].message;
      if (r.action === "squash") {
        const prevMsg = out.length ? (out[out.length - 1].message ?? repo.commits[out[out.length - 1].id].message) : "";
        out.push({ action: "squash", id: r.id, message: r.message !== original ? r.message : `${prevMsg}\n\n${original}` });
      } else if (r.action === "reword") out.push({ action: "reword", id: r.id, message: r.message });
      else out.push({ action: r.action, id: r.id });
    }
    onStart(out);
  };

  return (
    <Dialog title={`Interactive rebase onto ${label}`} onClose={onCancel} wide>
      <p className="mb-3 text-[13px] text-ink-2">
        Oldest commit at the top, the same order Git&apos;s todo file uses. Drag rows (or use the arrows) to reorder, and pick an action for each. Nothing changes until you start.
      </p>
      <Reorder.Group axis="y" values={rows} onReorder={setRows} className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <RebaseRow key={r.key} row={r} index={i} total={rows.length} onMove={move} onUpdate={update} original={repo.commits[r.id].message} />
        ))}
      </Reorder.Group>
      {invalid && <p className="mt-3 rounded-[var(--radius-sm)] bg-bad-soft px-3 py-2 text-[12.5px] text-bad">The first commit can&apos;t be {firstReal!.action}: there&apos;s no commit above it to merge into.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-[var(--radius-sm)] px-3 text-[13px] text-ink-2 hover:bg-surface-2">
          Cancel
        </button>
        <button type="button" onClick={start} disabled={!!invalid} className="h-9 rounded-[var(--radius-sm)] bg-[var(--lane-0)] px-3.5 text-[13px] font-medium text-white disabled:opacity-50">
          Start rebase
        </button>
      </div>
    </Dialog>
  );
}

function RebaseRow({ row, index, total, onMove, onUpdate, original }: { row: Row; index: number; total: number; onMove: (i: number, d: number) => void; onUpdate: (k: string, p: Partial<Row>) => void; original: string }) {
  const controls = useDragControls();
  const editable = row.action === "reword" || row.action === "squash";
  return (
    <Reorder.Item value={row} dragListener={false} dragControls={controls} className="rounded-[var(--radius-sm)] border border-rule bg-surface">
      <div className={`flex items-center gap-2 px-2 py-1.5 ${row.action === "drop" ? "opacity-55" : ""}`}>
        <button type="button" aria-label="Drag to reorder" onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none px-1 text-muted active:cursor-grabbing">
          <svg viewBox="0 0 10 16" className="h-3.5 w-2.5" aria-hidden>
            {[3, 8, 13].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.3} fill="currentColor" />))}
          </svg>
        </button>
        <select
          value={row.action}
          onChange={(e) => onUpdate(row.key, { action: e.target.value as RebaseAction })}
          aria-label={`Action for ${row.id.slice(0, 7)}`}
          className="h-7 rounded-md border border-rule-strong bg-surface px-1.5 font-mono text-[12px]"
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value} title={a.help}>
              {a.label}
            </option>
          ))}
        </select>
        <span className="font-mono text-[12px] text-muted">{row.id.slice(0, 7)}</span>
        <span className={`min-w-0 flex-1 truncate text-[13px] ${row.action === "drop" ? "line-through" : ""}`}>{original.split("\n")[0]}</span>
        <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, -1)} className="grid size-6 place-items-center rounded text-muted hover:bg-surface-2 disabled:opacity-30">
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(index, 1)} className="grid size-6 place-items-center rounded text-muted hover:bg-surface-2 disabled:opacity-30">
          ↓
        </button>
      </div>
      {editable && (
        <div className="border-t border-rule px-2 py-1.5">
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            {row.action === "reword" ? "New message" : "Message for the combined commit (leave as is to join both)"}
            <input
              value={row.message ?? ""}
              onChange={(e) => onUpdate(row.key, { message: e.target.value })}
              className="h-8 rounded-md border border-rule-strong bg-surface px-2 text-[13px] text-ink outline-none focus:border-[var(--focus)]"
            />
          </label>
        </div>
      )}
    </Reorder.Item>
  );
}
