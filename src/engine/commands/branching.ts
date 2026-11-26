import {
  type Command,
  type Ctx,
  PROJECT_PATH,
  aheadBehind,
  decorations,
  orphanedBy,
  requireCommit,
  requireRepo,
  trackingLines,
} from "../context";
import { short } from "../hash";
import {
  addReflog,
  checkoutTree,
  currentBranch,
  fail,
  firstLine,
  headId,
  isAncestor,
  resolveRev,
  setHead,
  tryResolve,
} from "../repo";
import { parseArgs } from "../shell";
import type { Head, Id, Repo } from "../types";
import { restorePaths } from "./basics";

export function validBranchName(name: string) {
  return (
    !!name &&
    !/[\s~^:?*[\\]/.test(name) &&
    !name.startsWith("-") &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.endsWith(".lock") &&
    !name.includes("..") &&
    !name.includes("@{") &&
    name !== "HEAD"
  );
}

export function createBranch(ctx: Ctx, name: string, start: Id, force = false) {
  const repo = ctx.repo;
  if (!validBranchName(name)) fail(`fatal: '${name}' is not a valid branch name`);
  if (repo.branches[name] && !force) fail(`fatal: a branch named '${name}' already exists`);
  if (force && currentBranch(repo) === name) fail(`fatal: cannot force update the branch '${name}' used by worktree at '${PROJECT_PATH}'`);
  const prev = repo.branches[name] ?? null;
  repo.branches[name] = start;
  addReflog(repo, name, start, prev, prev ? "branch: Reset to " + short(start) : "branch: Created from " + short(start));
  ctx.emit({ type: "ref", repo: ctx.key, ref: name, from: prev, to: start });
}

// ---------- branch ----------

export const branch: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["-d", "-D", "--delete", "-m", "-M", "--move", "-a", "--all", "-r", "--remotes", "-v", "-vv", "--list", "-f", "--force", "--unset-upstream", "--show-current", "--merged", "--no-merged", "-l", "-c"],
    value: ["-u", "--set-upstream-to"],
    alias: { "--delete": "-d", "--move": "-m", "--all": "-a", "--remotes": "-r", "--force": "-f", "--set-upstream-to": "-u", "-l": "--list" },
  });
  const repo = ctx.repo;
  const cur = currentBranch(repo);

  if (a.has("--show-current")) {
    if (cur) ctx.out(cur);
    return;
  }
  if (a.has("-u")) {
    const target = a.value("-u")!;
    const b = a.pos[0] ?? cur;
    if (!b) fail("fatal: could not set upstream of HEAD to " + target + " when it does not point to any branch.");
    const slash = target.indexOf("/");
    const remote = target.slice(0, slash);
    const rb = target.slice(slash + 1);
    if (slash < 0 || !repo.remoteRefs[remote]?.[rb]) fail(`fatal: the requested upstream branch '${target}' does not exist`, "hint: run git fetch first, or push with -u to create it");
    repo.upstream[b!] = { remote, branch: rb };
    ctx.out(`branch '${b}' set up to track '${target}'.`);
    return;
  }
  if (a.has("--unset-upstream")) {
    const b = a.pos[0] ?? cur;
    if (b) delete repo.upstream[b];
    return;
  }
  if (a.has("-d") || a.has("-D")) {
    if (!a.pos.length) fail("fatal: branch name required");
    const force = a.has("-D") || a.has("-f");
    for (const name of a.pos) {
      if (a.has("-r")) {
        const slash = name.indexOf("/");
        const r = repo.remoteRefs[name.slice(0, slash)];
        if (!r || !r[name.slice(slash + 1)]) fail(`error: remote-tracking branch '${name}' not found.`);
        const was = r[name.slice(slash + 1)];
        delete r[name.slice(slash + 1)];
        ctx.out(`Deleted remote-tracking branch ${name} (was ${short(was)}).`);
        continue;
      }
      const id = repo.branches[name];
      if (!id) fail(`error: branch '${name}' not found.`);
      if (name === cur) fail(`error: cannot delete branch '${name}' used by worktree at '${PROJECT_PATH}'`);
      if (!force) {
        const up = repo.upstream[name];
        const upId = up ? repo.remoteRefs[up.remote]?.[up.branch] : undefined;
        const h = headId(repo);
        const merged = (h && isAncestor(repo, id, h)) || (upId && isAncestor(repo, id, upId));
        if (!merged)
          fail(`error: the branch '${name}' is not fully merged.`, `hint: If you are sure you want to delete it, run 'git branch -D ${name}'`);
      }
      delete repo.branches[name];
      delete repo.upstream[name];
      delete repo.reflog[name];
      ctx.emit({ type: "ref", repo: ctx.key, ref: name, from: id, to: null });
      ctx.out(`Deleted branch ${name} (was ${short(id)}).`);
    }
    return;
  }
  if (a.has("-m") || a.has("-M") || a.has("-c")) {
    const [x, y] = a.pos;
    const from = y ? x : cur;
    const to = y ?? x;
    if (!from || !to) fail("fatal: branch name required");
    const id = repo.branches[from!];
    if (!id && from !== cur) fail(`error: refname refs/heads/${from} not found`);
    if (!validBranchName(to!)) fail(`fatal: '${to}' is not a valid branch name`);
    if (repo.branches[to!] && !a.has("-M")) fail(`fatal: a branch named '${to}' already exists`);
    if (a.has("-c")) {
      createBranch(ctx, to!, id);
      return;
    }
    if (id) repo.branches[to!] = id;
    delete repo.branches[from!];
    if (repo.upstream[from!]) {
      repo.upstream[to!] = repo.upstream[from!];
      delete repo.upstream[from!];
    }
    if (repo.reflog[from!]) {
      repo.reflog[to!] = repo.reflog[from!];
      delete repo.reflog[from!];
    }
    if (from === cur) repo.head = { kind: "branch", name: to! };
    ctx.emit({ type: "ref", repo: ctx.key, ref: to!, from: null, to: id ?? null });
    return;
  }
  if (a.pos.length && !a.has("--list")) {
    const [name, startRev] = a.pos;
    const start = startRev ? resolveRev(repo, startRev) : headId(repo);
    if (!start) fail(`fatal: not a valid object name: '${cur}'`);
    createBranch(ctx, name, start!, a.has("-f"));
    if (startRev && /\//.test(startRev) && tryResolve(repo, startRev) && !repo.branches[startRev]) {
      const slash = startRev.indexOf("/");
      if (repo.remoteRefs[startRev.slice(0, slash)]) {
        repo.upstream[name] = { remote: startRev.slice(0, slash), branch: startRev.slice(slash + 1) };
        ctx.out(`branch '${name}' set up to track '${startRev}'.`);
      }
    }
    return;
  }
  // list
  const verbose = a.has("-v") || a.has("-vv");
  const h = headId(repo);
  let names = Object.keys(repo.branches).sort();
  if (a.has("--merged") && h) names = names.filter((n) => isAncestor(repo, repo.branches[n], h));
  if (a.has("--no-merged") && h) names = names.filter((n) => !isAncestor(repo, repo.branches[n], h));
  const width = Math.max(0, ...names.map((n) => n.length));
  if (!a.has("-r")) {
    if (repo.head.kind === "detached") ctx.out(`* (HEAD detached at ${short(repo.head.id)})`, "success");
    for (const n of names) {
      const id = repo.branches[n];
      let line = `${n === cur ? "*" : " "} ${verbose ? n.padEnd(width) : n}`;
      if (verbose) {
        let track = "";
        const up = repo.upstream[n];
        if (a.has("-vv") && up) {
          const rid = repo.remoteRefs[up.remote]?.[up.branch];
          if (!rid) track = `[${up.remote}/${up.branch}: gone] `;
          else {
            const [ah, be] = aheadBehind(repo, id, rid);
            const parts = [ah ? `ahead ${ah}` : "", be ? `behind ${be}` : ""].filter(Boolean).join(", ");
            track = `[${up.remote}/${up.branch}${parts ? ": " + parts : ""}] `;
          }
        }
        line += ` ${short(id)} ${track}${firstLine(repo.commits[id].message)}`;
      }
      ctx.out(line, n === cur ? "success" : "normal");
    }
  }
  if (a.has("-a") || a.has("-r")) {
    for (const r of Object.keys(repo.remoteRefs).sort())
      for (const b of Object.keys(repo.remoteRefs[r]).sort())
        ctx.out(`  ${a.has("-r") ? "" : "remotes/"}${r}/${b}${verbose ? " " + short(repo.remoteRefs[r][b]) : ""}`, "error");
  }
};

// ---------- switch / checkout ----------

function previousBranch(repo: Repo): string | null {
  for (const e of repo.reflog.HEAD ?? []) {
    const m = /^checkout: moving from (\S+) to (\S+)$/.exec(e.message);
    if (m) return m[1];
  }
  return null;
}

function headLabel(repo: Repo): string {
  return repo.head.kind === "branch" ? repo.head.name : short(repo.head.id);
}

function guardOperation(ctx: Ctx) {
  const op = ctx.repo.op;
  if (op?.unmerged.length) fail("error: you need to resolve your current index first", ...op.unmerged.map((p) => `${p}: needs merge`));
}

/** Shared by switch/checkout: move HEAD to a branch or detached commit, updating files. */
export function moveTo(ctx: Ctx, target: Head, opts: { quietDetach?: boolean; created?: boolean } = {}) {
  const repo = ctx.repo;
  guardOperation(ctx);
  const fromId = headId(repo);
  const fromLabel = headLabel(repo);
  const toId = target.kind === "branch" ? (repo.branches[target.name] ?? null) : target.id;
  const wasDetached = repo.head.kind === "detached";
  if (toId) checkoutTree(repo, repo.commits[toId].tree);
  else checkoutTree(repo, {});
  const lost = wasDetached && fromId ? orphanedBy(repo, fromId, toId) : [];
  setHead(repo, target, `checkout: moving from ${fromLabel} to ${target.kind === "branch" ? target.name : toId}`);
  if (lost.length) {
    ctx.out(`Warning: you are leaving ${lost.length} commit${lost.length === 1 ? "" : "s"} behind, not connected to`, "warn");
    ctx.out("any of your branches:\n", "warn");
    for (const id of lost.slice(0, 5)) ctx.out(`  ${short(id)} ${firstLine(repo.commits[id].message)}`, "warn");
    ctx.out("\nIf you want to keep it by creating a new branch, this may be a good time\nto do so with:\n", "warn");
    ctx.out(` git branch <new-branch-name> ${short(lost[0])}\n`, "warn");
  }
  if (target.kind === "detached") {
    if (!opts.quietDetach) {
      ctx.out(`Note: switching to '${short(target.id)}'.\n`);
      ctx.out(
        "You are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n\nIf you want to create a new branch to retain commits you create, you may\ndo so (now or later) by using -c with the switch command. Example:\n\n  git switch -c <new-branch-name>\n\nOr undo this operation with:\n\n  git switch -\n",
        "hint",
      );
    } else if (wasDetached) ctx.out(`Previous HEAD position was ${short(fromId!)} ${firstLine(repo.commits[fromId!].message)}`);
    ctx.out(`HEAD is now at ${short(target.id)} ${firstLine(repo.commits[target.id].message)}`);
  } else {
    if (wasDetached && fromId && !lost.length) ctx.out(`Previous HEAD position was ${short(fromId)} ${firstLine(repo.commits[fromId].message)}`);
    ctx.out(opts.created ? `Switched to a new branch '${target.name}'` : `Switched to branch '${target.name}'`);
    trackingLines(repo, target.name).forEach((l) => ctx.out(l));
  }
  ctx.emit({ type: "head", repo: ctx.key });
  ctx.emit({ type: "files", repo: ctx.key });
}

/** Branch name that exists only on one remote → create a tracking branch (git's DWIM). */
function dwimRemote(repo: Repo, name: string): { remote: string; id: Id } | null {
  const hits = Object.keys(repo.remoteRefs).filter((r) => repo.remoteRefs[r][name]);
  return hits.length === 1 ? { remote: hits[0], id: repo.remoteRefs[hits[0]][name] } : null;
}

function switchToBranch(ctx: Ctx, name: string) {
  const repo = ctx.repo;
  if (currentBranch(repo) === name) {
    ctx.out(`Already on '${name}'`);
    trackingLines(repo, name).forEach((l) => ctx.out(l));
    return;
  }
  if (!repo.branches[name]) {
    const dw = dwimRemote(repo, name);
    if (!dw) return false;
    createBranch(ctx, name, dw.id);
    repo.upstream[name] = { remote: dw.remote, branch: name };
    ctx.out(`branch '${name}' set up to track '${dw.remote}/${name}'.`);
    moveTo(ctx, { kind: "branch", name }, { created: true });
    return;
  }
  moveTo(ctx, { kind: "branch", name });
}

function createAndSwitch(ctx: Ctx, name: string, startRev: string | undefined, force: boolean, track: boolean) {
  const repo = ctx.repo;
  const start = startRev ? resolveRev(repo, startRev) : headId(repo);
  if (!start) {
    // unborn branch: just rename HEAD
    if (!validBranchName(name)) fail(`fatal: '${name}' is not a valid branch name`);
    repo.head = { kind: "branch", name };
    ctx.out(`Switched to a new branch '${name}'`);
    return;
  }
  guardOperation(ctx);
  if (repo.branches[name] && !force) fail(`fatal: a branch named '${name}' already exists`);
  // check the file move before creating the ref, so a failure leaves no branch behind
  const snapshot = { index: { ...repo.index }, workdir: { ...repo.workdir } };
  checkoutTree(repo, repo.commits[start].tree);
  repo.index = snapshot.index;
  repo.workdir = snapshot.workdir;
  createBranch(ctx, name, start, force);
  if (startRev && (track || !repo.branches[startRev])) {
    const slash = startRev.indexOf("/");
    if (slash > 0 && repo.remoteRefs[startRev.slice(0, slash)]?.[startRev.slice(slash + 1)]) {
      repo.upstream[name] = { remote: startRev.slice(0, slash), branch: startRev.slice(slash + 1) };
      ctx.out(`branch '${name}' set up to track '${startRev}'.`);
    }
  }
  moveTo(ctx, { kind: "branch", name }, { created: true });
}

export const switchCmd: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["--detach", "-d", "-t", "--track", "--discard-changes", "-f", "--force", "-q"],
    value: ["-c", "--create", "-C", "--force-create"],
    alias: { "--create": "-c", "--force-create": "-C", "-d": "--detach", "--track": "-t", "--force": "-f" },
  });
  const repo = ctx.repo;
  if (a.has("-c") || a.has("-C")) {
    createAndSwitch(ctx, (a.value("-c") ?? a.value("-C"))!, a.pos[0], a.has("-C"), a.has("-t"));
    return;
  }
  let target = a.pos[0];
  if (!target) fail("fatal: missing branch or commit argument");
  if (target === "-") {
    const prev = previousBranch(repo);
    if (!prev) fail("fatal: invalid reference: @{-1}");
    target = prev!;
  }
  if (a.has("--detach")) {
    const id = resolveRev(repo, target);
    moveTo(ctx, { kind: "detached", id }, { quietDetach: true });
    return;
  }
  if (a.has("-t")) {
    const slash = target.indexOf("/");
    createAndSwitch(ctx, target.slice(slash + 1), target, false, true);
    return;
  }
  if (repo.branches[target] || target === currentBranch(repo)) return void switchToBranch(ctx, target);
  if (dwimRemote(repo, target)) return void switchToBranch(ctx, target);
  if (tryResolve(repo, target))
    fail(`fatal: a branch is expected, got commit '${target}'`, "hint: If you want to detach HEAD at the commit, try again with the --detach option.");
  fail(`fatal: invalid reference: ${target}`);
};

export const checkout: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["--detach", "-t", "--track", "-f", "--force", "--ours", "--theirs", "-q"],
    value: ["-b", "-B"],
    alias: { "--track": "-t", "--force": "-f" },
  });
  const repo = ctx.repo;
  if (a.has("--ours") || a.has("--theirs")) {
    restorePaths(ctx, [...a.pos, ...a.paths], { staged: false, worktree: true, side: a.has("--ours") ? "ours" : "theirs" });
    return;
  }
  if (a.has("-b") || a.has("-B")) {
    createAndSwitch(ctx, (a.value("-b") ?? a.value("-B"))!, a.pos[0], a.has("-B"), a.has("-t"));
    return;
  }
  if (a.paths.length) {
    // checkout [<rev>] -- <paths>
    const src = a.pos[0];
    restorePaths(ctx, a.paths, { staged: !!src, worktree: true, source: src, side: null });
    return;
  }
  let target = a.pos[0];
  if (!target) fail("error: you must specify a branch to checkout (or a path)");
  if (a.has("-t")) {
    const slash = target.indexOf("/");
    createAndSwitch(ctx, target.slice(slash + 1), target, false, true);
    return;
  }
  if (target === "-") {
    const prev = previousBranch(repo);
    if (!prev) fail("error: pathspec '-' did not match any file(s) known to git");
    target = prev!;
  }
  if (repo.branches[target] || target === currentBranch(repo) || (!tryResolve(repo, target) && dwimRemote(repo, target))) {
    if (a.has("--detach")) {
      moveTo(ctx, { kind: "detached", id: repo.branches[target] });
      return;
    }
    switchToBranch(ctx, target);
    return;
  }
  const id = tryResolve(repo, target);
  if (id) {
    moveTo(ctx, { kind: "detached", id });
    return;
  }
  if (target in repo.index || a.pos.length > 1) {
    restorePaths(ctx, a.pos, { staged: false, worktree: true, side: null });
    return;
  }
  fail(`error: pathspec '${target}' did not match any file(s) known to git`);
};

// ---------- tag ----------

export const tag: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["-d", "--delete", "-a", "--annotate", "-l", "--list", "-f"], value: ["-m"], alias: { "--delete": "-d", "--annotate": "-a", "--list": "-l" } });
  const repo = ctx.repo;
  if (a.has("-d")) {
    for (const t of a.pos) {
      if (!repo.tags[t]) fail(`error: tag '${t}' not found.`);
      ctx.out(`Deleted tag '${t}' (was ${short(repo.tags[t])})`);
      delete repo.tags[t];
      ctx.emit({ type: "ref", repo: ctx.key, ref: "tag:" + t, from: null, to: null });
    }
    return;
  }
  if (!a.pos.length || a.has("-l")) {
    Object.keys(repo.tags).sort().forEach((t) => ctx.out(t));
    return;
  }
  const [name, rev] = a.pos;
  if (a.has("-a") && !a.has("-m")) fail('fatal: no tag message — use git tag -a <name> -m "message"');
  if (repo.tags[name] && !a.has("-f")) fail(`fatal: tag '${name}' already exists`);
  const id = rev ? resolveRev(repo, rev) : requireCommit(ctx);
  repo.tags[name] = id;
  ctx.emit({ type: "ref", repo: ctx.key, ref: "tag:" + name, from: null, to: id });
};

// ---------- reflog ----------

export const reflog: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--all", "--oneline"], value: ["-n"] });
  const repo = ctx.repo;
  const pos = a.pos[0] === "show" ? a.pos.slice(1) : a.pos;
  if (pos[0] === "expire" || pos[0] === "delete") fail("branchwise: reflog expire/delete isn't simulated — the reflog is your safety net here.");
  const ref = pos[0] ?? "HEAD";
  const entries = repo.reflog[ref];
  if (!entries) fail(`fatal: ambiguous argument '${ref}': unknown revision or path not in the working tree.`);
  const n = a.value("-n") ? Number(a.value("-n")) : entries!.length;
  entries!.slice(0, n).forEach((e, i) => {
    ctx.out(`${short(e.id)}${decorations(repo, e.id)} ${ref}@{${i}}: ${e.message}`, i === 0 ? "warn" : "normal");
  });
};
