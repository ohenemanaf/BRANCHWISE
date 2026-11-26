import { diffLines, toLines } from "./diff";
import { short } from "./hash";
import { currentBranch, fail, headId, isAncestor, type GitError } from "./repo";
import type { EngineEvent, Id, Line, Repo, Tone, Tree, World } from "./types";

export interface Ctx {
  world: World;
  /** World key of the repo the terminal is in. */
  key: string;
  repo: Repo;
  out(text: string, tone?: Tone): void;
  emit(event: EngineEvent): void;
}

/** A command returns an exit code (0/undefined = success) or throws GitError. */
export type Command = (ctx: Ctx, argv: string[]) => number | void;

export function makeCtx(world: World, output: Line[], events: EngineEvent[]): Ctx {
  return {
    world,
    get key() {
      return world.cwd;
    },
    get repo() {
      return world.repos[world.cwd];
    },
    out(text, tone = "normal") {
      for (const l of text.split("\n")) output.push({ text: l, tone });
    },
    emit(e) {
      events.push(e);
    },
  };
}

export function printError(ctx: Ctx, e: GitError) {
  for (const l of e.lines) ctx.out(l, l.startsWith("hint:") ? "hint" : "error");
  for (const h of e.hints) ctx.out(h, "hint");
}

export const PROJECT_PATH = "/home/you/project";

export function requireRepo(ctx: Ctx) {
  if (!ctx.repo.initialized)
    fail("fatal: not a git repository (or any of the parent directories): .git", "hint: run git init (or git clone <url>) first");
}

export function requireCommit(ctx: Ctx): Id {
  const id = headId(ctx.repo);
  if (!id) fail("fatal: your current branch '" + (currentBranch(ctx.repo) ?? "HEAD") + "' does not have any commits yet");
  return id!;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** " 2 files changed, 3 insertions(+), 1 deletion(-)" plus per-file lines. */
export function diffStat(before: Tree, after: Tree, perFile = true): string[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const lines: string[] = [];
  let files = 0;
  let ins = 0;
  let del = 0;
  const width = Math.max(0, ...paths.map((p) => p.length));
  const created: string[] = [];
  const deleted: string[] = [];
  for (const p of paths) {
    if (before[p] === after[p]) continue;
    files++;
    const ops = diffLines(toLines(before[p] ?? ""), toLines(after[p] ?? ""));
    const a = ops.filter((o) => o.type === "add").length;
    const d = ops.filter((o) => o.type === "del").length;
    ins += a;
    del += d;
    if (!(p in before)) created.push(p);
    if (!(p in after)) deleted.push(p);
    if (perFile) lines.push(` ${p.padEnd(width)} | ${String(a + d).padStart(2)} ${"+".repeat(Math.min(a, 20))}${"-".repeat(Math.min(d, 20))}`);
  }
  if (!files) return [];
  let summary = ` ${plural(files, "file")} changed`;
  if (ins || !del) summary += `, ${ins} insertion${ins === 1 ? "" : "s"}(+)`;
  if (del) summary += `, ${del} deletion${del === 1 ? "" : "s"}(-)`;
  lines.push(summary);
  for (const p of created) lines.push(` create mode 100644 ${p}`);
  for (const p of deleted) lines.push(` delete mode 100644 ${p}`);
  return lines;
}

export function aheadBehind(repo: Repo, local: Id, remote: Id): [number, number] {
  const count = (from: Id, notIn: Id) => {
    const excl = new Set<Id>();
    const stack = [notIn];
    while (stack.length) {
      const c = stack.pop()!;
      if (excl.has(c) || !repo.commits[c]) continue;
      excl.add(c);
      stack.push(...repo.commits[c].parents);
    }
    let n = 0;
    const seen = new Set<Id>();
    const s2 = [from];
    while (s2.length) {
      const c = s2.pop()!;
      if (seen.has(c) || excl.has(c) || !repo.commits[c]) continue;
      seen.add(c);
      n++;
      s2.push(...repo.commits[c].parents);
    }
    return n;
  };
  return [count(local, remote), count(remote, local)];
}

/** The "Your branch is ahead of 'origin/main' by 1 commit." block. */
export function trackingLines(repo: Repo, branch: string): string[] {
  const up = repo.upstream[branch];
  if (!up) return [];
  const name = `${up.remote}/${up.branch}`;
  const remoteId = repo.remoteRefs[up.remote]?.[up.branch];
  const localId = repo.branches[branch];
  if (!remoteId) return [`Your branch is based on '${name}', but the upstream is gone.`, `  (use "git branch --unset-upstream" to fixup)`];
  if (!localId) return [];
  const [ahead, behind] = aheadBehind(repo, localId, remoteId);
  if (!ahead && !behind) return [`Your branch is up to date with '${name}'.`];
  if (ahead && !behind)
    return [`Your branch is ahead of '${name}' by ${plural(ahead, "commit")}.`, `  (use "git push" to publish your local commits)`];
  if (behind && !ahead)
    return [
      `Your branch is behind '${name}' by ${plural(behind, "commit")}, and can be fast-forwarded.`,
      `  (use "git pull" to update your local branch)`,
    ];
  return [
    `Your branch and '${name}' have diverged,`,
    `and have ${ahead} and ${behind} different commits each, respectively.`,
    `  (use "git pull" if you want to integrate the remote branch with yours)`,
  ];
}

/** "(HEAD -> main, origin/main, tag: v1)" */
export function decorations(repo: Repo, id: Id): string {
  const parts: string[] = [];
  const hb = repo.head.kind === "branch" ? repo.head.name : null;
  if (repo.head.kind === "detached" && repo.head.id === id) parts.push("HEAD");
  for (const b of Object.keys(repo.branches).sort()) {
    if (repo.branches[b] !== id) continue;
    parts.push(b === hb ? `HEAD -> ${b}` : b);
  }
  for (const r of Object.keys(repo.remoteRefs).sort())
    for (const b of Object.keys(repo.remoteRefs[r]).sort()) if (repo.remoteRefs[r][b] === id) parts.push(`${r}/${b}`);
  for (const t of Object.keys(repo.tags).sort()) if (repo.tags[t] === id) parts.push(`tag: ${t}`);
  // HEAD -> first
  parts.sort((a, b) => Number(b.startsWith("HEAD")) - Number(a.startsWith("HEAD")));
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Commits reachable from old HEAD that nothing else keeps alive (for the detached-HEAD warning). */
export function orphanedBy(repo: Repo, from: Id, newHead: Id | null): Id[] {
  const keep = new Set<Id>();
  const roots = [
    ...Object.values(repo.branches),
    ...Object.values(repo.tags),
    ...Object.values(repo.remoteRefs).flatMap((r) => Object.values(r)),
    ...(newHead ? [newHead] : []),
  ];
  for (const r of roots) {
    const stack = [r];
    while (stack.length) {
      const c = stack.pop()!;
      if (keep.has(c) || !repo.commits[c]) continue;
      keep.add(c);
      stack.push(...repo.commits[c].parents);
    }
  }
  const lost: Id[] = [];
  const stack = [from];
  const seen = new Set<Id>();
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c) || keep.has(c)) continue;
    seen.add(c);
    lost.push(c);
    stack.push(...repo.commits[c].parents);
  }
  return lost;
}

export { short, isAncestor };
