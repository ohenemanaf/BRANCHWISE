import { commitId, short } from "./hash";
import { merge3 } from "./diff";
import type { Commit, ConflictVersions, Head, Id, Repo, Tree, World } from "./types";

/** A command failure. `lines` are printed as errors/hints, exactly like Git would. */
export class GitError extends Error {
  constructor(
    public lines: string[],
    public hints: string[] = [],
  ) {
    super(lines.join("\n"));
  }
}

export const fail = (...lines: string[]): never => {
  throw new GitError(lines);
};

export function emptyRepo(name: string, opts: { bare?: boolean; initialized?: boolean } = {}): Repo {
  return {
    name,
    initialized: opts.initialized ?? true,
    bare: opts.bare ?? false,
    commits: {},
    branches: {},
    tags: {},
    remoteRefs: {},
    remotes: {},
    upstream: {},
    head: { kind: "branch", name: "main" },
    index: {},
    workdir: {},
    reflog: {},
    stash: [],
    op: null,
    bisect: null,
    config: {},
    origHead: null,
  };
}

export function emptyWorld(): World {
  return {
    repos: { local: emptyRepo("project", { initialized: false }) },
    cwd: "local",
    github: { repos: {}, prs: [], runs: [] },
    clock: 0,
    user: { name: "You", email: "you@example.com", login: "you" },
    testRule: null,
    teammate: "sam",
  };
}

export const currentRepo = (w: World): Repo => w.repos[w.cwd];

export function headId(repo: Repo): Id | null {
  return repo.head.kind === "detached" ? repo.head.id : (repo.branches[repo.head.name] ?? null);
}

export const currentBranch = (repo: Repo): string | null =>
  repo.head.kind === "branch" ? repo.head.name : null;

export function treeOf(repo: Repo, id: Id | null): Tree {
  return id ? repo.commits[id].tree : {};
}

export const headTree = (repo: Repo) => treeOf(repo, headId(repo));

export function sameTree(a: Tree, b: Tree): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => k in b && a[k] === b[k]);
}

export function writeCommit(
  world: World,
  repo: Repo,
  parts: { parents: Id[]; message: string; tree: Tree; author?: string; kind?: "stash" },
): Commit {
  world.clock += 1;
  const author = parts.author ?? world.user.name;
  const tree = { ...parts.tree };
  const id = commitId({ parents: parts.parents, message: parts.message, tree, author, time: world.clock });
  const commit: Commit = { id, parents: [...parts.parents], message: parts.message, tree, author, time: world.clock };
  if (parts.kind) commit.kind = parts.kind;
  repo.commits[id] = commit;
  return commit;
}

export function addReflog(repo: Repo, ref: string, id: Id, prev: Id | null, message: string) {
  (repo.reflog[ref] ??= []).unshift({ id, prev, message });
}

/** Move HEAD (the current branch, or the detached pointer) and log it. */
export function moveHead(repo: Repo, id: Id, message: string) {
  const prev = headId(repo);
  if (repo.head.kind === "branch") {
    repo.branches[repo.head.name] = id;
    addReflog(repo, repo.head.name, id, prev, message);
  } else {
    repo.head = { kind: "detached", id };
  }
  addReflog(repo, "HEAD", id, prev, message);
}

/** Point HEAD somewhere else (checkout/switch) and log it. */
export function setHead(repo: Repo, head: Head, message: string) {
  const prev = headId(repo);
  repo.head = head;
  const now = headId(repo);
  if (now) addReflog(repo, "HEAD", now, prev, message);
}

// ---------- ancestry ----------

export function ancestors(repo: Repo, id: Id): Set<Id> {
  const seen = new Set<Id>();
  const stack = [id];
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c) || !repo.commits[c]) continue;
    seen.add(c);
    stack.push(...repo.commits[c].parents);
  }
  return seen;
}

/** Is `a` an ancestor of (or equal to) `b`? */
export const isAncestor = (repo: Repo, a: Id, b: Id) => ancestors(repo, b).has(a);

export function mergeBase(repo: Repo, a: Id, b: Id): Id | null {
  const ancA = ancestors(repo, a);
  const common = [...ancestors(repo, b)].filter((x) => ancA.has(x));
  if (!common.length) return null;
  const best = common.filter((c) => !common.some((o) => o !== c && isAncestor(repo, c, o)));
  best.sort((x, y) => repo.commits[y].time - repo.commits[x].time);
  return best[0];
}

/** Commits reachable from `include` but not from any of `exclude`, oldest first (topological). */
export function rangeCommits(repo: Repo, include: Id, exclude: Id[]): Id[] {
  const ex = new Set<Id>();
  for (const e of exclude) for (const x of ancestors(repo, e)) ex.add(x);
  const set = [...ancestors(repo, include)].filter((x) => !ex.has(x));
  return topoSort(repo, set);
}

export function topoSort(repo: Repo, ids: Id[]): Id[] {
  const inSet = new Set(ids);
  const out: Id[] = [];
  const done = new Set<Id>();
  const visit = (id: Id) => {
    if (done.has(id)) return;
    done.add(id);
    for (const p of repo.commits[id].parents) if (inSet.has(p)) visit(p);
    out.push(id);
  };
  [...ids].sort((a, b) => repo.commits[a].time - repo.commits[b].time).forEach(visit);
  return out;
}

// ---------- revision parsing ----------

const unknownRev = (rev: string) =>
  fail(
    `fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`,
    "Use '--' to separate paths from revisions, like this:",
    "'git <command> [<revision>...] -- [<file>...]'",
  );

function resolveBase(repo: Repo, name: string): Id | null {
  if (name === "HEAD" || name === "@") return headId(repo);
  if (name === "ORIG_HEAD") return repo.origHead;
  if (name === "MERGE_HEAD") return repo.op?.kind === "merge" ? repo.op.theirs : null;
  const reflogMatch = /^(.+)@\{(\d+)\}$/.exec(name);
  if (reflogMatch) {
    const ref = reflogMatch[1] === "@" ? "HEAD" : reflogMatch[1];
    const entry = repo.reflog[ref]?.[Number(reflogMatch[2])];
    return entry ? entry.id : null;
  }
  const up = /^(.*)@\{(u|upstream)\}$/.exec(name);
  if (up) {
    const b = up[1] || currentBranch(repo);
    const u = b ? repo.upstream[b] : undefined;
    return u ? (repo.remoteRefs[u.remote]?.[u.branch] ?? null) : null;
  }
  const n = name.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "").replace(/^refs\/remotes\//, "");
  if (repo.branches[n]) return repo.branches[n];
  if (repo.tags[n]) return repo.tags[n];
  const slash = n.indexOf("/");
  if (slash > 0) {
    const r = repo.remoteRefs[n.slice(0, slash)];
    const id = r?.[n.slice(slash + 1)];
    if (id) return id;
  }
  if (/^[0-9a-f]{4,40}$/.test(n)) {
    const matches = Object.keys(repo.commits).filter((id) => id.startsWith(n));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) fail(`error: short object ID ${n} is ambiguous`);
  }
  return null;
}

/** Resolve HEAD~2, main^2, origin/main, a1b2c3d, v1.0, HEAD@{1}... */
export function resolveRev(repo: Repo, rev: string): Id {
  const m = /^(.*?)((?:[~^]\d*)*)$/.exec(rev)!;
  let id = resolveBase(repo, m[1] || "HEAD");
  if (!id) unknownRev(rev);
  const suffix = m[2];
  const re = /([~^])(\d*)/g;
  let s: RegExpExecArray | null;
  while ((s = re.exec(suffix))) {
    const n = s[2] === "" ? 1 : Number(s[2]);
    if (s[1] === "~") {
      for (let i = 0; i < n; i++) {
        const p = repo.commits[id!].parents[0];
        if (!p) unknownRev(rev);
        id = p;
      }
    } else if (n > 0) {
      const p = repo.commits[id!].parents[n - 1];
      if (!p) unknownRev(rev);
      id = p;
    }
  }
  return id!;
}

export function tryResolve(repo: Repo, rev: string): Id | null {
  try {
    return resolveRev(repo, rev);
  } catch {
    return null;
  }
}

/** A friendly name for a commit: a branch pointing at it, else its short id. */
export function describe(repo: Repo, id: Id): string {
  const b = Object.keys(repo.branches).find((k) => repo.branches[k] === id);
  return b ?? short(id);
}

// ---------- tree-level merge ----------

export interface TreeMergeResult {
  tree: Tree;
  /** What the working directory should contain (conflict markers included). */
  workdir: Tree;
  conflicts: string[];
  versions: Record<string, ConflictVersions>;
  messages: string[];
}

export function mergeTrees(
  base: Tree,
  ours: Tree,
  theirs: Tree,
  labels: { ours: string; theirs: string },
): TreeMergeResult {
  const tree: Tree = {};
  const workdir: Tree = {};
  const conflicts: string[] = [];
  const versions: Record<string, ConflictVersions> = {};
  const messages: string[] = [];
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  for (const p of [...paths].sort()) {
    const b = p in base ? base[p] : null;
    const o = p in ours ? ours[p] : null;
    const t = p in theirs ? theirs[p] : null;
    let result: string | null;
    if (o === t) result = o;
    else if (b === o) result = t;
    else if (b === t) result = o;
    else if (o !== null && t !== null) {
      const m = merge3(b ?? "", o, t, labels);
      if (m.clean) {
        result = m.content;
        messages.push(`Auto-merging ${p}`);
      } else {
        messages.push(`Auto-merging ${p}`, `CONFLICT (${b === null ? "add/add" : "content"}): Merge conflict in ${p}`);
        conflicts.push(p);
        versions[p] = { base: b, ours: o, theirs: t };
        tree[p] = o;
        workdir[p] = m.content;
        continue;
      }
    } else {
      // modify/delete
      const kept = (o ?? t)!;
      const deletedBy = o === null ? labels.ours : labels.theirs;
      const modifiedBy = o === null ? labels.theirs : labels.ours;
      messages.push(
        `CONFLICT (modify/delete): ${p} deleted in ${deletedBy} and modified in ${modifiedBy}.  Version ${modifiedBy} of ${p} left in tree.`,
      );
      conflicts.push(p);
      versions[p] = { base: b, ours: o, theirs: t };
      if (o !== null) tree[p] = o;
      workdir[p] = kept;
      continue;
    }
    if (result !== null) {
      tree[p] = result;
      workdir[p] = result;
    }
  }
  return { tree, workdir, conflicts, versions, messages };
}

// ---------- working tree ----------

export function ignored(repo: Repo, path: string): boolean {
  const gi = repo.workdir[".gitignore"];
  if (!gi) return false;
  return gi
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .some((pat) => {
      const p = pat.replace(/^\//, "");
      if (p.endsWith("/")) return path.startsWith(p) || path.includes("/" + p);
      const re = new RegExp(
        "^(?:.*/)?" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$",
      );
      return re.test(path);
    });
}

export interface Status {
  staged: { path: string; kind: "new file" | "modified" | "deleted" }[];
  unstaged: { path: string; kind: "modified" | "deleted" }[];
  untracked: string[];
  unmerged: string[];
}

export function status(repo: Repo): Status {
  const head = headTree(repo);
  const { index, workdir } = repo;
  const unmerged = repo.op?.unmerged ?? [];
  const staged: Status["staged"] = [];
  const unstaged: Status["unstaged"] = [];
  const untracked: string[] = [];
  for (const p of [...new Set([...Object.keys(head), ...Object.keys(index)])].sort()) {
    if (unmerged.includes(p)) continue;
    if (!(p in head)) staged.push({ path: p, kind: "new file" });
    else if (!(p in index)) staged.push({ path: p, kind: "deleted" });
    else if (head[p] !== index[p]) staged.push({ path: p, kind: "modified" });
  }
  for (const p of Object.keys(index).sort()) {
    if (unmerged.includes(p)) continue;
    if (!(p in workdir)) unstaged.push({ path: p, kind: "deleted" });
    else if (workdir[p] !== index[p]) unstaged.push({ path: p, kind: "modified" });
  }
  for (const p of Object.keys(workdir).sort()) {
    if (!(p in index) && !unmerged.includes(p) && !ignored(repo, p)) untracked.push(p);
  }
  return { staged, unstaged, untracked, unmerged: [...unmerged] };
}

export const isClean = (s: Status) =>
  !s.staged.length && !s.unstaged.length && !s.unmerged.length;

/**
 * Switch the index/workdir from the current HEAD tree to `target`, carrying local
 * changes along when they don't collide — Git's rule for checkout/switch/merge ff.
 */
export function checkoutTree(repo: Repo, target: Tree, action = "checkout") {
  const from = headTree(repo);
  const blocked: string[] = [];
  const untrackedBlocked: string[] = [];
  const paths = new Set([...Object.keys(from), ...Object.keys(target)]);
  for (const p of paths) {
    if (from[p] === target[p]) continue;
    const tracked = p in from || p in repo.index;
    if (tracked) {
      const dirty = repo.index[p] !== from[p] || repo.workdir[p] !== repo.index[p];
      if (dirty && !(repo.index[p] === target[p] && repo.workdir[p] === target[p])) blocked.push(p);
    } else if (p in repo.workdir && repo.workdir[p] !== target[p]) untrackedBlocked.push(p);
  }
  if (blocked.length)
    fail(
      `error: Your local changes to the following files would be overwritten by ${action}:`,
      ...blocked.map((p) => `\t${p}`),
      `Please commit your changes or stash them before you ${action === "checkout" ? "switch branches" : action}.`,
      "Aborting",
    );
  if (untrackedBlocked.length)
    fail(
      `error: The following untracked working tree files would be overwritten by ${action}:`,
      ...untrackedBlocked.map((p) => `\t${p}`),
      `Please move or remove them before you ${action === "checkout" ? "switch branches" : action}.`,
      "Aborting",
    );
  for (const p of paths) {
    if (from[p] === target[p]) continue;
    if (p in target) {
      repo.index[p] = target[p];
      repo.workdir[p] = target[p];
    } else {
      delete repo.index[p];
      delete repo.workdir[p];
    }
  }
}

/** Overwrite index + tracked files with `tree` (reset --hard). Untracked files stay. */
export function hardReset(repo: Repo, tree: Tree) {
  for (const p of Object.keys(repo.index)) if (!(p in tree)) delete repo.workdir[p];
  for (const p of repo.op?.unmerged ?? []) if (!(p in tree)) delete repo.workdir[p];
  repo.index = { ...tree };
  for (const [p, c] of Object.entries(tree)) repo.workdir[p] = c;
}

export const firstLine = (msg: string) => msg.split("\n")[0];
