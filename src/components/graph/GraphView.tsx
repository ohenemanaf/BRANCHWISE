"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import type { Id, Repo } from "@/engine/types";
import { type LaneMemory, type RefLabel, layoutRepo } from "@/viz/layout";

const lane = (n: number) => `var(--lane-${((n % 8) + 8) % 8})`;
const CHAR = 6.7;
const PILL_H = 17;
const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const;

interface PlacedLabel extends RefLabel {
  x: number;
  y: number;
  w: number;
  text: string;
}

function placeLabels(labels: RefLabel[], nodes: Map<Id, { x: number; y: number }>, sameLaneChild: Set<Id>): PlacedLabel[] {
  const byCommit = new Map<Id, RefLabel[]>();
  for (const l of labels) (byCommit.get(l.commit) ?? byCommit.set(l.commit, []).get(l.commit)!).push(l);
  const rank = (l: RefLabel) => (l.kind === "head" ? 0 : l.current ? 1 : l.kind === "branch" ? 2 : l.kind === "remote" ? 3 : 4);
  const out: PlacedLabel[] = [];
  for (const [id, ls] of byCommit) {
    const n = nodes.get(id);
    if (!n) continue;
    ls.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const items = ls.map((l) => {
      const text = l.current && l.kind === "branch" ? `HEAD → ${l.name}` : l.name;
      return { ...l, text, w: Math.ceil(text.length * CHAR + 14) };
    });
    if (!sameLaneChild.has(id)) {
      let x = n.x + 15;
      for (const it of items) {
        out.push({ ...it, x, y: n.y - PILL_H / 2 });
        x += it.w + 5;
      }
    } else {
      items.forEach((it, i) => out.push({ ...it, x: n.x - it.w / 2, y: n.y - 32 - i * (PILL_H + 3) }));
    }
  }
  return out;
}

export function GraphView({
  repo,
  cols,
  memory,
  showUnreachable,
  title,
  onNodeClick,
  emptyText,
  compact,
}: {
  repo: Repo;
  cols: Map<Id, number>;
  memory: LaneMemory;
  showUnreachable: boolean;
  title: string;
  onNodeClick?: (id: Id) => void;
  emptyText?: string;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const layout = useMemo(() => layoutRepo(repo, cols, memory, { showUnreachable }), [repo, cols, memory, showUnreachable]);
  const nodeMap = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const sameLaneChild = useMemo(() => {
    const s = new Set<Id>();
    for (const n of layout.nodes)
      for (const p of repo.commits[n.id].parents) {
        const pn = nodeMap.get(p);
        if (pn && pn.y === n.y) s.add(p);
      }
    return s;
  }, [layout, nodeMap, repo]);
  const labels = useMemo(() => placeLabels(layout.labels, nodeMap, sameLaneChild), [layout, nodeMap, sameLaneChild]);
  const minY = Math.min(0, ...labels.map((l) => l.y - 4));
  const width = Math.max(layout.width, ...labels.map((l) => l.x + l.w + 16), 320);
  const height = layout.height - minY;

  const scroller = useRef<HTMLDivElement>(null);
  const headNode = layout.nodes.find((n) => n.isHead);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !headNode) return;
    const target = headNode.x - el.clientWidth * 0.6;
    if (headNode.x < el.scrollLeft + 40 || headNode.x > el.scrollLeft + el.clientWidth - 160)
      el.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }, [headNode, reduce]);

  const t = reduce ? { duration: 0 } : spring;
  const branchNames = Object.keys(repo.branches).sort();
  const summary = `${title}: ${layout.nodes.filter((n) => n.reachable).length} commits${branchNames.length ? `, branches ${branchNames.join(", ")}` : ""}.`;

  return (
    <section aria-label={title} className="min-w-0">
      <div className="flex items-center justify-between px-3 pt-2 text-[12px] text-muted">
        <span className="font-medium text-ink-2">{title}</span>
        {repo.op && <OpBadge repo={repo} />}
      </div>
      <div ref={scroller} className="overflow-x-auto overflow-y-hidden scroll-thin">
        {layout.nodes.length === 0 ? (
          <p className={`px-3 ${compact ? "py-4" : "py-8"} text-[13px] text-muted`}>{emptyText ?? "No commits yet."}</p>
        ) : (
          <svg width={width} height={height} viewBox={`0 ${minY} ${width} ${height}`} role="img" aria-label={summary} className="block">
            <g>
              <AnimatePresence initial={false}>
                {layout.edges.map((e) => (
                  <motion.path
                    key={e.key}
                    d={e.d}
                    fill="none"
                    stroke={lane(e.lane)}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray={e.faded ? "4 5" : undefined}
                    initial={e.faded ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
                    animate={e.faded ? { opacity: 0.35, d: e.d } : { pathLength: 1, opacity: 1, d: e.d }}
                    exit={{ opacity: 0 }}
                    transition={t}
                  />
                ))}
              </AnimatePresence>
            </g>
            <g>
              <AnimatePresence initial={false}>
                {layout.nodes.map((n) => {
                  const c = lane(n.lane);
                  const ring = n.mark === "bad" ? "var(--bad)" : n.mark === "good" ? "var(--ok)" : null;
                  return (
                    <motion.g
                      key={n.id}
                      initial={{ x: n.x, y: n.y, scale: 0.3, opacity: 0 }}
                      animate={{ x: n.x, y: n.y, scale: 1, opacity: n.reachable ? 1 : 0.4 }}
                      exit={{ scale: 0.3, opacity: 0 }}
                      transition={t}
                      tabIndex={0}
                      role="button"
                      aria-label={`Commit ${n.id.slice(0, 7)}: ${n.message}${n.reachable ? "" : " (not on any branch)"}`}
                      onClick={() => onNodeClick?.(n.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          onNodeClick?.(n.id);
                        }
                      }}
                      className="cursor-pointer outline-none [&:focus-visible>circle:first-of-type]:stroke-[var(--focus)]"
                    >
                      <title>{`${n.id.slice(0, 7)}  ${n.message}`}</title>
                      {ring && <circle r={13} fill="none" stroke={ring} strokeWidth={2.5} />}
                      {n.mark === "current" && <circle r={13} fill="none" stroke="var(--warn)" strokeWidth={2} strokeDasharray="3 3" />}
                      {n.stash ? (
                        <rect x={-8} y={-8} width={16} height={16} rx={4} fill="var(--surface)" stroke={c} strokeWidth={2.5} strokeDasharray="3 2.5" />
                      ) : (
                        <circle r={8.5} fill={n.isHead ? c : "var(--surface)"} stroke={c} strokeWidth={3} strokeDasharray={n.reachable ? undefined : "3 3"} />
                      )}
                      {n.merge && <circle r={3} fill={n.isHead ? "var(--surface)" : c} />}
                      <text y={23} textAnchor="middle" className="fill-[var(--muted)] font-mono" fontSize={9.5}>
                        {n.id.slice(0, 7)}
                      </text>
                    </motion.g>
                  );
                })}
              </AnimatePresence>
            </g>
            <g>
              <AnimatePresence initial={false}>
                {labels.map((l) => {
                  const c = lane(l.lane);
                  const filled = l.kind === "head" || l.current;
                  const bg = l.kind === "head" ? "var(--ink)" : filled ? c : l.kind === "tag" ? "var(--surface-2)" : "var(--surface)";
                  const fg = filled ? "var(--surface)" : l.kind === "tag" ? "var(--ink-2)" : c;
                  return (
                    <motion.g key={l.key} initial={{ x: l.x, y: l.y, opacity: 0 }} animate={{ x: l.x, y: l.y, opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
                      <rect
                        width={l.w}
                        height={PILL_H}
                        rx={PILL_H / 2}
                        fill={bg}
                        stroke={l.kind === "tag" ? "var(--rule-strong)" : c}
                        strokeWidth={1.3}
                        strokeDasharray={l.kind === "remote" ? "3 2" : undefined}
                      />
                      <text x={l.w / 2} y={12.2} textAnchor="middle" fontSize={11} fill={fg} className="font-mono" fontWeight={filled ? 500 : 400}>
                        {l.text}
                      </text>
                    </motion.g>
                  );
                })}
              </AnimatePresence>
            </g>
          </svg>
        )}
      </div>
    </section>
  );
}

function OpBadge({ repo }: { repo: Repo }) {
  const op = repo.op!;
  const text = op.kind === "merge" ? "Merging" : op.kind === "rebase" ? "Rebasing" : op.kind === "revert" ? "Reverting" : "Cherry-picking";
  const conflicts = op.unmerged.length;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${conflicts ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
      {text}
      {conflicts ? `: ${conflicts} conflict${conflicts === 1 ? "" : "s"}` : ""}
    </span>
  );
}
