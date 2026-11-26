import {
  type Command,
  type Ctx,
  PROJECT_PATH,
  decorations,
  diffStat,
  requireCommit,
  requireRepo,
  trackingLines,
} from "../context";
import { diffLines, hasConflictMarkers, toLines } from "../diff";
import { short } from "../hash";
import {
  currentBranch,
  fail,
  firstLine,
  headId,
  headTree,
  ignored,
  moveHead,
  resolveRev,
  sameTree,
  status,
  treeOf,
  tryResolve,
  writeCommit,
} from "../repo";
import { parseArgs } from "../shell";
import type { Id, Repo, Tree } from "../types";

// ---------- pathspecs ----------

function globToRe(p: string) {
  return new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
}

/** Expand a pathspec against a set of known paths ("." , dirs, globs, exact). */
export function matchPaths(spec: string, known: string[]): string[] {
  const s = spec.replace(/^\.\//, "").replace(/\/$/, "");
  if (s === "." || s === "" || s === ":/") return known;
  if (/[*?]/.test(s)) {
    const re = globToRe(s);
    return known.filter((k) => re.test(k) || re.test(k.split("/").pop()!));
  }
  return known.filter((k) => k === s || k.startsWith(s + "/"));
}

function expand(_ctx: Ctx, specs: string[], known: string[]): string[] {
  const out = new Set<string>();
  for (const sp of specs) {
    const m = matchPaths(sp, known);
    if (!m.length) fail(`fatal: pathspec '${sp}' did not match any files`);
    m.forEach((x) => out.add(x));
  }
  return [...out].sort();
}

// ---------- init / config ----------

export const init: Command = (ctx, argv) => {
  const a = parseArgs(argv, { bool: ["--bare", "-q"], value: ["-b", "--initial-branch"], alias: { "--initial-branch": "-b" } });
  const repo = ctx.repo;
  if (repo.initialized) {
    ctx.out(`Reinitialized existing Git repository in ${PROJECT_PATH}/.git/`);
    return;
  }
  repo.initialized = true;
  repo.head = { kind: "branch", name: a.value("-b") ?? repo.config["init.defaultBranch"] ?? "main" };
  ctx.out(`Initialized empty Git repository in ${PROJECT_PATH}/.git/`);
  ctx.emit({ type: "head", repo: ctx.key });
};

export const config: Command = (ctx, argv) => {
  const a = parseArgs(argv, { bool: ["--global", "--local", "--list", "-l", "--unset"], alias: { "-l": "--list" } });
  const repo = ctx.repo;
  const all = (): Record<string, string> => ({
    "user.name": ctx.world.user.name,
    "user.email": ctx.world.user.email,
    ...repo.config,
    ...Object.fromEntries(Object.entries(repo.remotes).map(([r, u]) => [`remote.${r}.url`, u])),
    ...Object.fromEntries(
      Object.entries(repo.upstream).flatMap(([b, u]) => [
        [`branch.${b}.remote`, u.remote],
        [`branch.${b}.merge`, `refs/heads/${u.branch}`],
      ]),
    ),
  });
  if (a.has("--list")) {
    for (const [k, v] of Object.entries(all())) ctx.out(`${k}=${v}`);
    return;
  }
  const [key, ...rest] = a.pos;
  if (!key) fail("usage: git config [<options>] <name> [<value>]");
  if (a.has("--unset")) {
    delete repo.config[key];
    return;
  }
  if (!rest.length) {
    const v = all()[key];
    if (v === undefined) return 1;
    ctx.out(v);
    return;
  }
  const value = rest.join(" ");
  if (key === "user.name") ctx.world.user.name = value;
  else if (key === "user.email") ctx.world.user.email = value;
  else repo.config[key] = value;
};

// ---------- status ----------

function opBanner(repo: Repo): string[] {
  const op = repo.op;
  if (!op) return [];
  if (op.kind === "merge")
    return op.unmerged.length
      ? ["You have unmerged paths.", '  (fix conflicts and run "git commit")', '  (use "git merge --abort" to abort the merge)']
      : ["All conflicts fixed but you are still merging.", '  (use "git commit" to conclude merge)'];
  if (op.kind === "rebase")
    return [
      `You are currently rebasing${op.branch ? ` branch '${op.branch}'` : ""} on '${short(op.onto)}'.`,
      op.unmerged.length
        ? '  (fix conflicts and then run "git rebase --continue")'
        : '  (all conflicts fixed: run "git rebase --continue")',
      '  (use "git rebase --skip" to skip this patch)',
      '  (use "git rebase --abort" to check out the original branch)',
    ];
  const verb = op.kind;
  return [
    `You are currently ${verb === "revert" ? "reverting" : "cherry-picking"} commit ${short(op.commit || repo.origHead || "")}.`,
    op.unmerged.length
      ? `  (fix conflicts and run "git ${verb} --continue")`
      : `  (all conflicts fixed: run "git ${verb} --continue")`,
    `  (use "git ${verb} --abort" to cancel the ${verb} operation)`,
  ];
}

export const statusCmd: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["-s", "--short", "-sb", "-b", "--branch"], alias: { "--short": "-s", "--branch": "-b" } });
  const repo = ctx.repo;
  const st = status(repo);
  if (a.has("-s")) {
    for (const p of st.unmerged) ctx.out(`UU ${p}`, "error");
    const map = new Map<string, [string, string]>();
    for (const s of st.staged) map.set(s.path, [s.kind === "new file" ? "A" : s.kind === "deleted" ? "D" : "M", " "]);
    for (const u of st.unstaged) map.set(u.path, [map.get(u.path)?.[0] ?? " ", u.kind === "deleted" ? "D" : "M"]);
    for (const [p, [x, y]] of [...map].sort()) ctx.out(`${x}${y} ${p}`, x !== " " ? "success" : "error");
    for (const p of st.untracked) ctx.out(`?? ${p}`, "error");
    return;
  }
  const b = currentBranch(repo);
  if (repo.bisect) ctx.out(`You are currently bisecting, started from branch '${repo.bisect.origHead.kind === "branch" ? repo.bisect.origHead.name : "HEAD"}'.`);
  if (b) ctx.out(`On branch ${b}`);
  else if (repo.op?.kind === "rebase") ctx.out(`interactive rebase in progress; onto ${short(repo.op.onto)}`);
  else ctx.out(`HEAD detached at ${short(headId(repo)!)}`, "error");
  if (b) trackingLines(repo, b).forEach((l) => ctx.out(l));
  if (!headId(repo)) ctx.out("\nNo commits yet");
  const banner = opBanner(repo);
  if (banner.length) {
    ctx.out("");
    banner.forEach((l) => ctx.out(l));
  }
  if (st.staged.length) {
    ctx.out("\nChanges to be committed:");
    ctx.out(headId(repo) ? '  (use "git restore --staged <file>..." to unstage)' : '  (use "git rm --cached <file>..." to unstage)', "muted");
    for (const s of st.staged) ctx.out(`\t${(s.kind + ":").padEnd(12)}${s.path}`, "success");
  }
  if (st.unmerged.length) {
    ctx.out("\nUnmerged paths:");
    ctx.out('  (use "git add/rm <file>..." as appropriate to mark resolution)', "muted");
    const vers = repo.op && "versions" in repo.op ? repo.op.versions : {};
    for (const p of st.unmerged) {
      const v = vers[p];
      const kind = !v ? "both modified" : v.ours === null ? "deleted by us" : v.theirs === null ? "deleted by them" : v.base === null ? "both added" : "both modified";
      ctx.out(`\t${(kind + ":").padEnd(17)}${p}`, "error");
    }
  }
  if (st.unstaged.length) {
    ctx.out("\nChanges not staged for commit:");
    ctx.out('  (use "git add <file>..." to update what will be committed)', "muted");
    ctx.out('  (use "git restore <file>..." to discard changes in working directory)', "muted");
    for (const u of st.unstaged) ctx.out(`\t${(u.kind + ":").padEnd(12)}${u.path}`, "error");
  }
  if (st.untracked.length) {
    ctx.out("\nUntracked files:");
    ctx.out('  (use "git add <file>..." to include in what will be committed)', "muted");
    for (const p of st.untracked) ctx.out(`\t${p}`, "error");
  }
  if (!st.staged.length && !st.unstaged.length && !st.unmerged.length) {
    if (st.untracked.length) ctx.out('\nnothing added to commit but untracked files present (use "git add" to track)');
    else ctx.out(headId(repo) ? "\nnothing to commit, working tree clean" : '\nnothing to commit (create/copy files and use "git add" to track)');
  } else if (!st.staged.length) {
    ctx.out('\nno changes added to commit (use "git add" and/or "git commit -a")');
  }
};

// ---------- add / rm / mv ----------

function resolveConflictPath(ctx: Ctx, p: string) {
  const op = ctx.repo.op;
  if (!op || !op.unmerged.includes(p)) return;
  op.unmerged = op.unmerged.filter((x) => x !== p);
  const content = ctx.repo.workdir[p];
  if (content !== undefined && hasConflictMarkers(content))
    ctx.out(`branchwise: ${p} still contains conflict markers (<<<<<<<) — Git lets you stage it anyway, so double-check.`, "warn");
}

export const add: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["-A", "--all", "-u", "--update", "-f", "--force", "-p", "--patch", "-v", "--verbose", "-n", "--dry-run"],
    alias: { "--all": "-A", "--update": "-u", "--force": "-f", "--patch": "-p" },
  });
  const repo = ctx.repo;
  if (a.has("-p")) ctx.out("branchwise: interactive staging (-p) isn't simulated; staging whole files instead.", "warn");
  let specs = [...a.pos, ...a.paths];
  if (a.has("-A") || a.has("-u")) specs = specs.length ? specs : ["."];
  if (!specs.length) fail("Nothing specified, nothing added.", "hint: Maybe you wanted to say 'git add .'?");
  const unmerged = repo.op?.unmerged ?? [];
  const known = [...new Set([...Object.keys(repo.workdir), ...Object.keys(repo.index), ...unmerged])].sort();
  const paths = expand(ctx, specs, known);
  const ignoredHits: string[] = [];
  for (const p of paths) {
    const tracked = p in repo.index;
    if (!tracked && a.has("-u")) continue;
    if (!tracked && !unmerged.includes(p) && ignored(repo, p) && !a.has("-f")) {
      if (specs.some((s) => s === p)) ignoredHits.push(p);
      continue;
    }
    if (a.has("-n")) {
      ctx.out(`add '${p}'`);
      continue;
    }
    if (p in repo.workdir) repo.index[p] = repo.workdir[p];
    else delete repo.index[p];
    resolveConflictPath(ctx, p);
  }
  if (ignoredHits.length)
    fail(
      "The following paths are ignored by one of your .gitignore files:",
      ...ignoredHits,
      "hint: Use -f if you really want to add them.",
    );
  ctx.emit({ type: "files", repo: ctx.key });
};

export const rm: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--cached", "-r", "-f", "--force", "-q"], alias: { "--force": "-f" } });
  const repo = ctx.repo;
  const specs = [...a.pos, ...a.paths];
  if (!specs.length) fail("usage: git rm [<options>] [--] <pathspec>...");
  const paths = expand(ctx, specs, Object.keys(repo.index).sort());
  for (const p of paths) {
    if (!a.has("--cached") && !a.has("-f") && repo.workdir[p] !== undefined && repo.workdir[p] !== repo.index[p])
      fail("error: the following file has local modifications:", `    ${p}`, "(use --cached to keep the file, or -f to force removal)");
    delete repo.index[p];
    if (!a.has("--cached")) delete repo.workdir[p];
    resolveConflictPath(ctx, p);
    ctx.out(`rm '${p}'`);
  }
  ctx.emit({ type: "files", repo: ctx.key });
};

export const mv: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["-f"] });
  const [from, to] = a.pos;
  const repo = ctx.repo;
  if (!from || !to) fail("usage: git mv [<options>] <source>... <destination>");
  if (!(from in repo.index)) fail(`fatal: not under version control, source=${from}, destination=${to}`);
  if (to in repo.workdir && !a.has("-f")) fail(`fatal: destination exists, source=${from}, destination=${to}`);
  repo.index[to] = repo.index[from];
  delete repo.index[from];
  repo.workdir[to] = repo.workdir[from] ?? repo.index[to];
  delete repo.workdir[from];
  ctx.emit({ type: "files", repo: ctx.key });
};

// ---------- commit ----------

export function commitBanner(repo: Repo, id: Id, root: boolean) {
  const b = currentBranch(repo);
  const where = b ? `${b}${root ? " (root-commit)" : ""}` : "detached HEAD";
  return `[${where} ${short(id)}] ${firstLine(repo.commits[id].message)}`;
}

export const commit: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["-a", "--all", "--amend", "--allow-empty", "--no-edit", "-q", "--quiet", "-v", "--no-verify", "-n"],
    value: ["-m", "--message"],
    alias: { "--all": "-a", "--message": "-m", "--quiet": "-q", "-n": "--no-verify" },
  });
  const repo = ctx.repo;
  const op = repo.op;
  if (op?.unmerged.length)
    fail(
      "error: Committing is not possible because you have unmerged files.",
      "hint: Fix them up in the work tree, and then use 'git add/rm <file>'",
      "hint: as appropriate to mark resolution and make a commit.",
      "fatal: Exiting because of an unresolved conflict.",
    );
  if (a.has("-a")) {
    for (const p of Object.keys(repo.index)) {
      if (p in repo.workdir) repo.index[p] = repo.workdir[p];
      else delete repo.index[p];
    }
  }
  if (a.pos.length) {
    // git commit <paths> — commit only those paths (staging them first)
    for (const p of a.pos) {
      if (!(p in repo.index) && !(p in repo.workdir)) fail(`error: pathspec '${p}' did not match any file(s) known to git`);
      if (p in repo.workdir) repo.index[p] = repo.workdir[p];
    }
  }
  const head = headId(repo);
  const amend = a.has("--amend");
  if (amend && !head) fail("fatal: You have nothing to amend.");
  const parentTree = amend ? treeOf(repo, repo.commits[head!].parents[0] ?? null) : headTree(repo);
  const opMessage = !op
    ? null
    : op.kind === "rebase"
      ? op.current
        ? repo.commits[op.current.id].message
        : null
      : op.message;
  const isMergeConclusion = op?.kind === "merge" && !op.squash;
  if (!amend && !a.has("--allow-empty") && !isMergeConclusion && sameTree(repo.index, headTree(repo))) {
    const st = status(repo);
    const b = currentBranch(repo);
    if (b) ctx.out(`On branch ${b}`);
    if (st.unstaged.length || st.untracked.length) {
      ctx.out(st.unstaged.length ? "Changes not staged for commit:" : "Untracked files:");
      for (const u of st.unstaged) ctx.out(`\tmodified:   ${u.path}`, "error");
      for (const u of st.untracked) ctx.out(`\t${u}`, "error");
      ctx.out(
        st.unstaged.length
          ? '\nno changes added to commit (use "git add" and/or "git commit -a")'
          : '\nnothing added to commit but untracked files present (use "git add" to track)',
      );
    } else ctx.out("nothing to commit, working tree clean");
    return 1;
  }
  let message = a.values("-m").join("\n\n");
  if (!message && amend && head) message = repo.commits[head].message;
  if (!message && opMessage) message = opMessage;
  if (!message)
    fail(
      "Aborting commit due to empty commit message.",
      'hint: there is no text editor in this simulator — use git commit -m "your message"',
    );
  const parents = amend
    ? [...repo.commits[head!].parents]
    : isMergeConclusion
      ? [head!, op.theirs]
      : head
        ? [head]
        : [];
  const c = writeCommit(ctx.world, repo, { parents, message, tree: repo.index });
  const verb = amend ? "commit (amend)" : isMergeConclusion ? "commit (merge)" : !head ? "commit (initial)" : "commit";
  moveHead(repo, c.id, `${verb}: ${firstLine(message)}`);
  if (op?.kind === "rebase") op.current = null;
  else if (op) {
    if (op.kind === "merge" || op.remaining.length === 0) repo.op = null;
    else op.commit = "";
  }
  ctx.emit({ type: "commit", repo: ctx.key, id: c.id });
  if (!a.has("-q")) {
    ctx.out(commitBanner(repo, c.id, !parents.length), "success");
    diffStat(parentTree, c.tree, false).forEach((l) => ctx.out(l));
  }
};

// ---------- log / show / diff ----------

function logOrder(repo: Repo, starts: Id[]): Id[] {
  const seen = new Set<Id>();
  const stack = [...starts];
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c) || !repo.commits[c]) continue;
    seen.add(c);
    stack.push(...repo.commits[c].parents);
  }
  return [...seen].sort((a, b) => repo.commits[b].time - repo.commits[a].time);
}

function printCommit(ctx: Ctx, id: Id, oneline: boolean, graph = false) {
  const repo = ctx.repo;
  const c = repo.commits[id];
  const dec = decorations(repo, id);
  const g = graph ? "* " : "";
  if (oneline) {
    ctx.out(`${g}${short(id)}${dec} ${firstLine(c.message)}`, "normal");
    return;
  }
  ctx.out(`${g}commit ${id}${dec}`, "warn");
  if (c.parents.length > 1) ctx.out(`Merge: ${c.parents.map(short).join(" ")}`);
  ctx.out(`Author: ${c.author} <${c.author === ctx.world.user.name ? ctx.world.user.email : c.author.toLowerCase() + "@example.com"}>`);
  ctx.out("");
  for (const l of c.message.split("\n")) ctx.out(`    ${l}`);
  ctx.out("");
}

export const log: Command = (ctx, argv) => {
  requireRepo(ctx);
  const nArg = argv.find((x) => /^-\d+$/.test(x));
  const a = parseArgs(
    argv.filter((x) => x !== nArg),
    {
      bool: ["--oneline", "--all", "--graph", "--decorate", "--reverse", "--first-parent", "--stat", "-p"],
      value: ["-n", "--max-count", "--author", "--grep"],
      alias: { "--max-count": "-n" },
    },
  );
  const repo = ctx.repo;
  const max = nArg ? Number(nArg.slice(1)) : a.value("-n") ? Number(a.value("-n")) : Infinity;
  let starts: Id[];
  let exclude: Set<Id> = new Set();
  const range = a.pos.find((p) => p.includes(".."));
  if (a.has("--all")) {
    starts = [...Object.values(repo.branches), ...Object.values(repo.tags), ...Object.values(repo.remoteRefs).flatMap((r) => Object.values(r))];
    const h = headId(repo);
    if (h) starts.push(h);
  } else if (range) {
    const [x, y] = range.split(/\.{2,3}/);
    starts = [resolveRev(repo, y || "HEAD")];
    exclude = new Set(logOrder(repo, [resolveRev(repo, x || "HEAD")]));
  } else if (a.pos.length) starts = a.pos.map((p) => resolveRev(repo, p));
  else {
    const h = headId(repo);
    if (!h) fail(`fatal: your current branch '${currentBranch(repo)}' does not have any commits yet`);
    starts = [h!];
  }
  let ids = logOrder(repo, starts).filter((id) => !exclude.has(id));
  if (a.has("--first-parent")) {
    const fp: Id[] = [];
    let cur: Id | undefined = starts[0];
    while (cur) {
      fp.push(cur);
      cur = repo.commits[cur].parents[0];
    }
    ids = ids.filter((id) => fp.includes(id));
  }
  const author = a.value("--author");
  if (author) ids = ids.filter((id) => repo.commits[id].author.toLowerCase().includes(author.toLowerCase()));
  const grep = a.value("--grep");
  if (grep) ids = ids.filter((id) => repo.commits[id].message.toLowerCase().includes(grep.toLowerCase()));
  ids = ids.slice(0, max);
  if (a.has("--reverse")) ids.reverse();
  for (const id of ids) {
    printCommit(ctx, id, a.has("--oneline"), a.has("--graph"));
    if (a.has("--stat") || a.has("-p")) {
      const c = repo.commits[id];
      const before = treeOf(repo, c.parents[0] ?? null);
      if (a.has("-p")) unifiedDiff(before, c.tree).forEach((l) => ctx.out(l.text, l.tone));
      else diffStat(before, c.tree).forEach((l) => ctx.out(l));
      ctx.out("");
    }
  }
};

type DLine = { text: string; tone: "normal" | "success" | "error" | "muted" | "warn" };

export function unifiedDiff(before: Tree, after: Tree, paths?: string[]): DLine[] {
  const all = paths ?? [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const out: DLine[] = [];
  for (const p of all) {
    if (before[p] === after[p]) continue;
    out.push({ text: `diff --git a/${p} b/${p}`, tone: "warn" });
    if (!(p in before)) out.push({ text: "new file mode 100644", tone: "muted" });
    if (!(p in after)) out.push({ text: "deleted file mode 100644", tone: "muted" });
    out.push({ text: p in before ? `--- a/${p}` : "--- /dev/null", tone: "muted" });
    out.push({ text: p in after ? `+++ b/${p}` : "+++ /dev/null", tone: "muted" });
    const a = toLines(before[p] ?? "");
    const b = toLines(after[p] ?? "");
    out.push({ text: `@@ -1,${a.length} +1,${b.length} @@`, tone: "muted" });
    for (const op of diffLines(a, b))
      out.push(
        op.type === "eq"
          ? { text: ` ${op.line}`, tone: "normal" }
          : op.type === "add"
            ? { text: `+${op.line}`, tone: "success" }
            : { text: `-${op.line}`, tone: "error" },
      );
  }
  return out;
}

export const show: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--stat", "--oneline", "--name-only"] });
  const repo = ctx.repo;
  const spec = a.pos[0] ?? "HEAD";
  const colon = spec.indexOf(":");
  if (colon > 0) {
    const id = resolveRev(repo, spec.slice(0, colon));
    const path = spec.slice(colon + 1);
    const content = repo.commits[id].tree[path];
    if (content === undefined) fail(`fatal: path '${path}' does not exist in '${spec.slice(0, colon)}'`);
    ctx.out(content.replace(/\n$/, ""));
    return;
  }
  const id = resolveRev(repo, spec);
  const c = repo.commits[id];
  printCommit(ctx, id, a.has("--oneline"));
  const before = treeOf(repo, c.parents[0] ?? null);
  if (a.has("--name-only")) {
    Object.keys({ ...before, ...c.tree }).filter((p) => before[p] !== c.tree[p]).sort().forEach((p) => ctx.out(p));
    return;
  }
  const lines = a.has("--stat") ? diffStat(before, c.tree).map((t) => ({ text: t, tone: "normal" as const })) : unifiedDiff(before, c.tree);
  lines.forEach((l) => ctx.out(l.text, l.tone));
};

export const diff: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--staged", "--cached", "--stat", "--name-only"], alias: { "--cached": "--staged" } });
  const repo = ctx.repo;
  let before: Tree;
  let after: Tree;
  const revs = a.pos.flatMap((p) => (p.includes("..") ? p.split(/\.{2,3}/) : [p])).filter(Boolean);
  if (revs.length >= 2) {
    before = treeOf(repo, resolveRev(repo, revs[0]));
    after = treeOf(repo, resolveRev(repo, revs[1]));
  } else if (revs.length === 1) {
    before = treeOf(repo, resolveRev(repo, revs[0]));
    after = a.has("--staged") ? repo.index : trackedWorkdir(repo);
  } else if (a.has("--staged")) {
    before = headTree(repo);
    after = repo.index;
  } else {
    before = repo.index;
    after = trackedWorkdir(repo);
  }
  const paths = a.paths.length ? a.paths : undefined;
  if (a.has("--name-only")) {
    [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((p) => before[p] !== after[p]).sort().forEach((p) => ctx.out(p));
    return;
  }
  const lines = a.has("--stat") ? diffStat(before, after).map((t) => ({ text: t, tone: "normal" as const })) : unifiedDiff(before, after, paths);
  lines.forEach((l) => ctx.out(l.text, l.tone));
};

/** Working directory limited to tracked paths (what `git diff` compares). */
function trackedWorkdir(repo: Repo): Tree {
  const t: Tree = {};
  for (const p of Object.keys(repo.index)) if (p in repo.workdir) t[p] = repo.workdir[p];
  return t;
}

// ---------- restore ----------

export const restore: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["--staged", "-S", "--worktree", "-W", "--ours", "--theirs"],
    value: ["--source", "-s"],
    alias: { "-S": "--staged", "-W": "--worktree", "-s": "--source" },
  });
  restorePaths(ctx, [...a.pos, ...a.paths], {
    staged: a.has("--staged"),
    worktree: a.has("--worktree") || !a.has("--staged"),
    source: a.value("--source"),
    side: a.has("--ours") ? "ours" : a.has("--theirs") ? "theirs" : null,
  });
};

export function restorePaths(
  ctx: Ctx,
  specs: string[],
  o: { staged: boolean; worktree: boolean; source?: string; side: "ours" | "theirs" | null },
) {
  const repo = ctx.repo;
  if (!specs.length) fail("fatal: you must specify path(s) to restore");
  if (o.side) {
    const op = repo.op;
    if (!op || !("versions" in op)) fail("error: path is not unmerged — --ours/--theirs only work during a conflict");
    for (const p of expand(ctx, specs, Object.keys(op!.versions))) {
      const v = op!.versions[p][o.side];
      if (v === null) delete repo.workdir[p];
      else repo.workdir[p] = v;
    }
    ctx.emit({ type: "files", repo: ctx.key });
    return;
  }
  const sourceTree = o.source ? treeOf(repo, resolveRev(repo, o.source)) : o.staged ? headTree(repo) : repo.index;
  const known = [...new Set([...Object.keys(sourceTree), ...Object.keys(repo.index), ...Object.keys(repo.workdir)])].sort();
  const paths = expand(ctx, specs, known);
  for (const p of paths) {
    if (!(p in sourceTree) && !(p in repo.index) && !o.staged) {
      fail(`error: pathspec '${p}' did not match any file(s) known to git`);
    }
    if (o.staged) {
      if (p in sourceTree) repo.index[p] = sourceTree[p];
      else delete repo.index[p];
    }
    if (o.worktree) {
      const src = o.source ? sourceTree : o.staged ? sourceTree : repo.index;
      if (p in src) repo.workdir[p] = src[p];
      else if (o.staged || o.source) delete repo.workdir[p];
    }
  }
  ctx.emit({ type: "files", repo: ctx.key });
}

export { tryResolve, requireCommit };
