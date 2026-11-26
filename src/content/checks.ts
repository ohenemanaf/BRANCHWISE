import { headId, isAncestor, resolveRev, status } from "@/engine/repo";
import type { Id, Repo, World } from "@/engine/types";

/** Small, readable predicates for lesson and scenario goals. */

export const repoOf = (w: World): Repo => w.repos[w.cwd];
export const head = (w: World): Id | null => headId(repoOf(w));
export const onBranch = (w: World, b: string) => {
  const h = repoOf(w).head;
  return h.kind === "branch" && h.name === b;
};
export const tip = (w: World, b: string): Id | undefined => repoOf(w).branches[b];
export const remoteTip = (w: World, ghKey: string, b: string): Id | undefined => w.repos[ghKey]?.branches[b];
export const msgAt = (w: World, rev: string): string | null => {
  try {
    return repoOf(w).commits[resolveRev(repoOf(w), rev)].message;
  } catch {
    return null;
  }
};
export const commitCount = (w: World, b = "HEAD"): number => {
  const r = repoOf(w);
  let id: Id | undefined | null;
  try {
    id = resolveRev(r, b);
  } catch {
    return 0;
  }
  let n = 0;
  while (id) {
    n++;
    id = r.commits[id].parents[0];
  }
  return n;
};
export const clean = (w: World) => {
  const s = status(repoOf(w));
  return !s.staged.length && !s.unstaged.length && !s.unmerged.length;
};
export const noUntracked = (w: World) => status(repoOf(w)).untracked.length === 0;
export const committedFile = (w: World, path: string, rev = "HEAD"): string | undefined => {
  try {
    const r = repoOf(w);
    return r.commits[resolveRev(r, rev)].tree[path];
  } catch {
    return undefined;
  }
};
export const contains = (w: World, a: Id | undefined, b: Id | undefined) => !!a && !!b && isAncestor(repoOf(w), a, b);
export const isMerge = (w: World, rev = "HEAD") => {
  try {
    const r = repoOf(w);
    return r.commits[resolveRev(r, rev)].parents.length > 1;
  } catch {
    return false;
  }
};
export const noOp = (w: World) => !repoOf(w).op;
export const messages = (w: World, rev = "HEAD", n = 10): string[] => {
  const out: string[] = [];
  const r = repoOf(w);
  let id: Id | undefined;
  try {
    id = resolveRev(r, rev);
  } catch {
    return out;
  }
  while (id && out.length < n) {
    out.push(r.commits[id].message.split("\n")[0]);
    id = r.commits[id].parents[0];
  }
  return out;
};
