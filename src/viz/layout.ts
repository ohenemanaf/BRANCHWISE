import { ancestors, headId } from "@/engine/repo";
import type { Id, Repo } from "@/engine/types";

export const COL = 54;
export const ROW = 44;
export const PAD_X = 36;
export const PAD_Y = 34;

export interface GraphNode {
  id: Id;
  x: number;
  y: number;
  lane: number;
  reachable: boolean;
  merge: boolean;
  stash: boolean;
  message: string;
  isHead: boolean;
  /** Bisect / scenario highlight. */
  mark?: "bad" | "good" | "current";
}

export interface GraphEdge {
  key: string;
  d: string;
  lane: number;
  faded: boolean;
}

export type RefKind = "branch" | "remote" | "tag" | "head";

export interface RefLabel {
  key: string;
  name: string;
  kind: RefKind;
  commit: Id;
  lane: number;
  current: boolean;
}

export interface Layout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  labels: RefLabel[];
  width: number;
  height: number;
  lanes: number;
}

/** Lanes stay put between renders: once a commit or branch has a lane, it keeps it. */
export interface LaneMemory {
  branch: Record<string, number>;
  commit: Record<Id, number>;
  next: number;
}

export const newLaneMemory = (): LaneMemory => ({ branch: { main: 0 }, commit: {}, next: 1 });

/** Shared column order across several repos, so the same commit lines up vertically. */
export function columnOrder(repos: Repo[]): Map<Id, number> {
  const all = new Map<Id, { time: number; parents: Id[] }>();
  for (const r of repos) for (const c of Object.values(r.commits)) all.set(c.id, { time: c.time, parents: c.parents });
  const ids = [...all.keys()].sort((a, b) => all.get(a)!.time - all.get(b)!.time);
  // stable topo: parents before children even if clocks were odd
  const out: Id[] = [];
  const done = new Set<Id>();
  const visit = (id: Id) => {
    if (done.has(id)) return;
    done.add(id);
    for (const p of all.get(id)?.parents ?? []) if (all.has(p)) visit(p);
    out.push(id);
  };
  ids.forEach(visit);
  return new Map(out.map((id, i) => [id, i]));
}

function refRoots(repo: Repo): { name: string; laneKey: string; id: Id }[] {
  const roots: { name: string; laneKey: string; id: Id }[] = [];
  const branchNames = Object.keys(repo.branches);
  const order = (n: string) => (n === "main" || n === "master" ? 0 : 1);
  branchNames.sort((a, b) => order(a) - order(b) || repo.commits[repo.branches[a]].time - repo.commits[repo.branches[b]].time);
  for (const b of branchNames) roots.push({ name: b, laneKey: b, id: repo.branches[b] });
  for (const r of Object.keys(repo.remoteRefs))
    for (const b of Object.keys(repo.remoteRefs[r])) roots.push({ name: `${r}/${b}`, laneKey: b, id: repo.remoteRefs[r][b] });
  for (const t of Object.keys(repo.tags)) roots.push({ name: `tag:${t}`, laneKey: `tag:${t}`, id: repo.tags[t] });
  if (repo.head.kind === "detached") roots.push({ name: "HEAD", laneKey: "(detached)", id: repo.head.id });
  if (repo.op?.kind === "rebase") roots.push({ name: "ORIG", laneKey: repo.op.branch ?? "(detached)", id: repo.op.origHead });
  return roots;
}

export function layoutRepo(
  repo: Repo,
  cols: Map<Id, number>,
  mem: LaneMemory,
  opts: { showUnreachable: boolean; colOffset?: number } = { showUnreachable: true },
): Layout {
  const roots = refRoots(repo);
  const reachable = new Set<Id>();
  for (const r of roots) for (const id of ancestors(repo, r.id)) reachable.add(id);
  const stashIds = new Set(repo.stash.map((s) => s.id));
  for (const s of repo.stash) reachable.add(s.id);

  const visible = Object.keys(repo.commits).filter((id) => {
    if (reachable.has(id)) return true;
    if (repo.commits[id].kind === "stash") return false; // dropped stashes vanish
    return opts.showUnreachable;
  });
  const visibleSet = new Set(visible);

  const laneFor = (key: string) => {
    if (mem.branch[key] === undefined) mem.branch[key] = mem.next++;
    return mem.branch[key];
  };
  // claim first-parent chains from each ref
  for (const r of roots) {
    const lane = laneFor(r.laneKey);
    let cur: Id | undefined = r.id;
    while (cur && visibleSet.has(cur) && mem.commit[cur] === undefined) {
      mem.commit[cur] = lane;
      cur = repo.commits[cur].parents[0];
    }
  }
  for (const s of repo.stash) if (mem.commit[s.id] === undefined) mem.commit[s.id] = laneFor(`stash@${s.id}`);
  // anything left (unreachable chains): inherit from a child already placed, else own lane
  const children = new Map<Id, Id[]>();
  for (const id of visible) for (const p of repo.commits[id].parents) (children.get(p) ?? children.set(p, []).get(p)!).push(id);
  const remaining = visible.filter((id) => mem.commit[id] === undefined).sort((a, b) => repo.commits[b].time - repo.commits[a].time);
  for (const id of remaining) {
    if (mem.commit[id] !== undefined) continue;
    const lane = laneFor(`lost:${id}`);
    let cur: Id | undefined = id;
    while (cur && visibleSet.has(cur) && mem.commit[cur] === undefined) {
      mem.commit[cur] = lane;
      cur = repo.commits[cur].parents[0];
    }
  }

  // compact the lanes this repo actually uses into consecutive rows
  const usedLanes = [...new Set(visible.map((id) => mem.commit[id]))].sort((a, b) => a - b);
  const row = new Map(usedLanes.map((l, i) => [l, i]));
  const usedCols = [...new Set(visible.map((id) => cols.get(id)!))].sort((a, b) => a - b);
  const colIndex = new Map(usedCols.map((c, i) => [c, i]));
  const shared = opts.colOffset === undefined;
  const xOf = (id: Id) => PAD_X + (shared ? cols.get(id)! : colIndex.get(cols.get(id)!)!) * COL;
  const yOf = (id: Id) => PAD_Y + row.get(mem.commit[id])! * ROW;

  const hid = repo.bare ? null : headId(repo);
  const bisect = repo.bisect;
  const nodes: GraphNode[] = visible.map((id) => {
    const c = repo.commits[id];
    return {
      id,
      x: xOf(id),
      y: yOf(id),
      lane: mem.commit[id],
      reachable: reachable.has(id),
      merge: c.parents.length > 1,
      stash: stashIds.has(id) || c.kind === "stash",
      message: c.message.split("\n")[0],
      isHead: id === hid,
      mark: bisect ? (bisect.bad === id ? "bad" : bisect.good.includes(id) ? "good" : bisect.current === id ? "current" : undefined) : undefined,
    };
  });
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  for (const n of nodes) {
    repo.commits[n.id].parents.forEach((p, i) => {
      const pn = pos.get(p);
      if (!pn) return;
      let d: string;
      if (pn.y === n.y) d = `M${pn.x},${pn.y} L${n.x},${n.y}`;
      else {
        // leave the parent's lane, bend, then run along the child's lane
        const bend = Math.min(COL * 0.9, n.x - pn.x);
        const sx = n.x - bend;
        d = `M${pn.x},${pn.y} L${sx},${pn.y} C${sx + bend * 0.55},${pn.y} ${n.x - bend * 0.45},${n.y} ${n.x},${n.y}`;
        if (sx < pn.x) d = `M${pn.x},${pn.y} C${(pn.x + n.x) / 2},${pn.y} ${(pn.x + n.x) / 2},${n.y} ${n.x},${n.y}`;
      }
      edges.push({ key: `${p}-${n.id}-${i}`, d, lane: i === 0 ? n.lane : pn.lane, faded: !n.reachable });
    });
  }

  const labels: RefLabel[] = [];
  const cur = repo.head.kind === "branch" && !repo.bare ? repo.head.name : null;
  for (const [b, id] of Object.entries(repo.branches)) if (pos.has(id)) labels.push({ key: `b:${b}`, name: b, kind: "branch", commit: id, lane: mem.commit[id], current: b === cur });
  for (const r of Object.keys(repo.remoteRefs))
    for (const [b, id] of Object.entries(repo.remoteRefs[r]))
      if (pos.has(id)) labels.push({ key: `r:${r}/${b}`, name: `${r}/${b}`, kind: "remote", commit: id, lane: mem.commit[id], current: false });
  for (const [t, id] of Object.entries(repo.tags)) if (pos.has(id)) labels.push({ key: `t:${t}`, name: t, kind: "tag", commit: id, lane: mem.commit[id], current: false });
  repo.stash.forEach((s, i) => labels.push({ key: `s:${s.id}`, name: `stash@{${i}}`, kind: "tag", commit: s.id, lane: mem.commit[s.id], current: false }));
  if (repo.head.kind === "detached" && pos.has(repo.head.id))
    labels.push({ key: "HEAD", name: "HEAD", kind: "head", commit: repo.head.id, lane: mem.commit[repo.head.id], current: true });

  const maxX = Math.max(0, ...nodes.map((n) => n.x));
  const maxY = Math.max(0, ...nodes.map((n) => n.y));
  return { nodes, edges, labels, width: maxX + 140, height: maxY + PAD_Y + 26, lanes: usedLanes.length };
}
