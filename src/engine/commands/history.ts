import { type Command, type Ctx, diffStat, plural, requireCommit, requireRepo } from "../context";
import { short } from "../hash";
import {
  type TreeMergeResult,
  ancestors,
  checkoutTree,
  currentBranch,
  fail,
  firstLine,
  hardReset,
  headId,
  headTree,
  isAncestor,
  isClean,
  mergeBase,
  mergeTrees,
  moveHead,
  rangeCommits,
  resolveRev,
  sameTree,
  setHead,
  status,
  treeOf,
  writeCommit,
} from "../repo";
import { parseArgs } from "../shell";
import type { Commit, Id, RebaseStep, Repo, Tree } from "../types";
import { commitBanner, matchPaths } from "./basics";

// ---------- shared merge plumbing ----------

/** Write a tree-merge result into index/workdir, refusing to clobber local changes. */
export function applyTreeMerge(ctx: Ctx, res: TreeMergeResult, action: string) {
  const repo = ctx.repo;
  const head = headTree(repo);
  const all = new Set([...Object.keys(head), ...Object.keys(res.tree), ...Object.keys(res.workdir)]);
  const touched = [...all].filter(
    (p) => res.conflicts.includes(p) || head[p] !== res.tree[p] || (p in res.workdir && res.workdir[p] !== head[p]),
  );
  const blocked = touched.filter((p) => (p in head || p in repo.index) && (repo.index[p] !== head[p] || repo.workdir[p] !== repo.index[p]));
  if (blocked.length)
    fail(
      `error: Your local changes to the following files would be overwritten by ${action}:`,
      ...blocked.map((p) => `\t${p}`),
      `Please commit your changes or stash them before you ${action}.`,
      "Aborting",
    );
  const untracked = touched.filter((p) => !(p in head) && !(p in repo.index) && p in repo.workdir && repo.workdir[p] !== res.workdir[p]);
  if (untracked.length)
    fail(
      `error: The following untracked working tree files would be overwritten by ${action}:`,
      ...untracked.map((p) => `\t${p}`),
      `Please move or remove them before you ${action}.`,
      "Aborting",
    );
  for (const p of touched) {
    if (p in res.tree) repo.index[p] = res.tree[p];
    else delete repo.index[p];
    if (p in res.workdir) repo.workdir[p] = res.workdir[p];
    else delete repo.workdir[p];
  }
}

function requireNoOp(ctx: Ctx) {
  const op = ctx.repo.op;
  if (!op) return;
  if (op.kind === "merge") fail("fatal: You have not concluded your merge (MERGE_HEAD exists).", "hint: Please, commit your changes before you merge.", "hint: Or run git merge --abort");
  if (op.kind === "rebase") fail("fatal: A rebase is in progress. Use git rebase --continue, --skip or --abort.");
  fail(`error: a ${op.kind} is in progress`, `hint: use "git ${op.kind} --continue" or "git ${op.kind} --abort"`);
}

function mergeMessage(repo: Repo, rev: string) {
  let m: string;
  if (repo.branches[rev]) m = `Merge branch '${rev}'`;
  else if (repo.tags[rev]) m = `Merge tag '${rev}'`;
  else if (rev.includes("/") && Object.keys(repo.remoteRefs).includes(rev.split("/")[0])) m = `Merge remote-tracking branch '${rev}'`;
  else m = `Merge commit '${rev}'`;
  const cur = currentBranch(repo);
  if (cur && cur !== "main" && cur !== "master") m += ` into ${cur}`;
  return m;
}

// ---------- merge ----------

export function doMerge(
  ctx: Ctx,
  rev: string,
  o: { noFF?: boolean; ffOnly?: boolean; squash?: boolean; message?: string; label?: string } = {},
): number | void {
  const repo = ctx.repo;
  requireNoOp(ctx);
  const theirs = resolveRev(repo, rev);
  const head = headId(repo);
  if (!head) {
    checkoutTree(repo, repo.commits[theirs].tree, "merge");
    moveHead(repo, theirs, `merge ${rev}: Fast-forward`);
    ctx.emit({ type: "ref", repo: ctx.key, ref: currentBranch(repo) ?? "HEAD", from: null, to: theirs });
    return;
  }
  if (isAncestor(repo, theirs, head)) {
    ctx.out("Already up to date.");
    return;
  }
  const before = headTree(repo);
  const canFF = isAncestor(repo, head, theirs);
  if (canFF && !o.noFF && !o.squash) {
    checkoutTree(repo, repo.commits[theirs].tree, "merge");
    moveHead(repo, theirs, `merge ${rev}: Fast-forward`);
    repo.origHead = head;
    ctx.out(`Updating ${short(head)}..${short(theirs)}`);
    ctx.out("Fast-forward");
    diffStat(before, repo.commits[theirs].tree).forEach((l) => ctx.out(l));
    ctx.emit({ type: "ref", repo: ctx.key, ref: currentBranch(repo) ?? "HEAD", from: head, to: theirs });
    ctx.emit({ type: "files", repo: ctx.key });
    return;
  }
  if (o.ffOnly) {
    fail("hint: Diverging branches can't be fast-forwarded, you need to either:", "hint:", "hint: \tgit merge --no-ff", "hint:", "hint: or:", "hint:", "hint: \tgit rebase", "fatal: Not possible to fast-forward, aborting.");
  }
  const base = mergeBase(repo, head, theirs);
  const label = o.label ?? rev;
  const res = mergeTrees(treeOf(repo, base), before, repo.commits[theirs].tree, { ours: "HEAD", theirs: label });
  applyTreeMerge(ctx, res, "merge");
  res.messages.forEach((m) => ctx.out(m, m.startsWith("CONFLICT") ? "error" : "normal"));
  const message = o.message ?? mergeMessage(repo, rev);
  repo.origHead = head;
  if (res.conflicts.length) {
    repo.op = { kind: "merge", theirs, squash: !!o.squash, label, message, unmerged: [...res.conflicts], versions: res.versions };
    ctx.out("Automatic merge failed; fix conflicts and then commit the result.", "error");
    ctx.emit({ type: "conflict", repo: ctx.key, paths: res.conflicts });
    ctx.emit({ type: "files", repo: ctx.key });
    return 1;
  }
  if (o.squash) {
    ctx.out("Squash commit -- not updating HEAD");
    ctx.out("Automatic merge went well; stopped before committing as requested");
    ctx.emit({ type: "files", repo: ctx.key });
    return;
  }
  const c = writeCommit(ctx.world, repo, { parents: [head, theirs], message, tree: repo.index });
  moveHead(repo, c.id, `merge ${rev}: Merge made by the 'ort' strategy.`);
  ctx.out("Merge made by the 'ort' strategy.");
  diffStat(before, c.tree).forEach((l) => ctx.out(l));
  ctx.emit({ type: "commit", repo: ctx.key, id: c.id });
  ctx.emit({ type: "files", repo: ctx.key });
}

export const merge: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["--no-ff", "--ff-only", "--ff", "--squash", "--abort", "--continue", "--no-edit", "--edit", "-e", "--quit"],
    value: ["-m", "--message"],
    alias: { "--message": "-m" },
  });
  const repo = ctx.repo;
  if (a.has("--abort") || a.has("--quit")) {
    if (repo.op?.kind !== "merge") fail("fatal: There is no merge to abort (MERGE_HEAD missing).");
    hardReset(repo, headTree(repo));
    repo.op = null;
    ctx.emit({ type: "files", repo: ctx.key });
    return;
  }
  if (a.has("--continue")) {
    if (repo.op?.kind !== "merge") fail("fatal: There is no merge in progress (MERGE_HEAD missing).");
    return concludeWithCommit(ctx);
  }
  if (!a.pos.length) {
    const b = currentBranch(repo);
    const up = b ? repo.upstream[b] : undefined;
    if (!up) fail("fatal: No remote for the current branch.");
    return doMerge(ctx, `${up!.remote}/${up!.branch}`, { noFF: a.has("--no-ff"), ffOnly: a.has("--ff-only"), squash: a.has("--squash"), message: a.value("-m") });
  }
  if (a.pos.length > 1) fail("branchwise: octopus merges (more than one branch at once) aren't simulated — merge them one at a time.");
  requireCommit(ctx);
  return doMerge(ctx, a.pos[0], { noFF: a.has("--no-ff"), ffOnly: a.has("--ff-only"), squash: a.has("--squash"), message: a.value("-m") });
};

/** Finish the in-progress operation by committing the index with its default message. */
function concludeWithCommit(ctx: Ctx): number | void {
  const repo = ctx.repo;
  const op = repo.op!;
  if (op.unmerged.length)
    fail("error: Committing is not possible because you have unmerged files.", "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", "fatal: Exiting because of an unresolved conflict.");
  if (op.kind !== "merge") return;
  const head = headId(repo)!;
  const parents = op.squash ? [head] : [head, op.theirs];
  const c = writeCommit(ctx.world, repo, { parents, message: op.message, tree: repo.index });
  moveHead(repo, c.id, `commit (merge): ${firstLine(op.message)}`);
  repo.op = null;
  ctx.out(commitBanner(repo, c.id, false), "success");
  ctx.emit({ type: "commit", repo: ctx.key, id: c.id });
}

// ---------- cherry-pick / revert ----------

function pickLabels(c: Commit, mode: "pick" | "revert") {
  const tag = `${short(c.id)} (${firstLine(c.message)})`;
  return mode === "pick" ? { ours: "HEAD", theirs: tag } : { ours: "HEAD", theirs: `parent of ${tag}` };
}

/** Three-way apply of one commit (or its inverse) onto HEAD's tree. Writes files; may throw. */
function applyCommit(ctx: Ctx, c: Commit, mode: "pick" | "revert", mainline: number | undefined, action: string) {
  const repo = ctx.repo;
  if (c.parents.length > 1 && mainline === undefined)
    fail(`error: commit ${c.id} is a merge but no -m option was given.`, `fatal: ${action} failed`);
  const parent = c.parents[(mainline ?? 1) - 1] ?? null;
  const parentTree = treeOf(repo, parent);
  const res =
    mode === "pick"
      ? mergeTrees(parentTree, headTree(repo), c.tree, pickLabels(c, mode))
      : mergeTrees(c.tree, headTree(repo), parentTree, pickLabels(c, mode));
  applyTreeMerge(ctx, res, action);
  return res;
}

function runPicks(ctx: Ctx, mode: "cherry-pick" | "revert", ids: Id[], mainline?: number, noCommit = false): number | void {
  const repo = ctx.repo;
  while (ids.length) {
    const id = ids.shift()!;
    const c = repo.commits[id];
    const res = applyCommit(ctx, c, mode === "cherry-pick" ? "pick" : "revert", mainline, mode);
    const message =
      mode === "cherry-pick" ? c.message : `Revert "${firstLine(c.message)}"\n\nThis reverts commit ${c.id}.`;
    if (res.conflicts.length) {
      res.messages.forEach((m) => ctx.out(m, m.startsWith("CONFLICT") ? "error" : "normal"));
      repo.op = { kind: mode, commit: id, remaining: ids, message, unmerged: [...res.conflicts], versions: res.versions };
      ctx.out(`error: could not ${mode === "revert" ? "revert" : "apply"} ${short(id)}... ${firstLine(c.message)}`, "error");
      ctx.out(`hint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git ${mode} --continue".\nhint: You can instead skip this commit with "git ${mode} --skip".\nhint: To abort and get back to the state before "git ${mode}",\nhint: run "git ${mode} --abort".`, "hint");
      ctx.emit({ type: "conflict", repo: ctx.key, paths: res.conflicts });
      ctx.emit({ type: "files", repo: ctx.key });
      return 1;
    }
    if (noCommit) continue;
    if (sameTree(repo.index, headTree(repo))) {
      ctx.out(`The previous ${mode} is now empty, possibly due to conflict resolution.`, "warn");
      ctx.out(`branchwise: skipped ${short(id)} — its changes are already in HEAD.`, "hint");
      continue;
    }
    const nc = writeCommit(ctx.world, repo, {
      parents: [headId(repo)!],
      message,
      tree: repo.index,
      author: mode === "cherry-pick" ? c.author : undefined,
    });
    moveHead(repo, nc.id, `${mode}: ${firstLine(message)}`);
    ctx.out(commitBanner(repo, nc.id, false), "success");
    diffStat(treeOf(repo, nc.parents[0]), nc.tree, false).forEach((l) => ctx.out(l));
    ctx.emit({ type: "commit", repo: ctx.key, id: nc.id });
  }
  repo.op = null;
  ctx.emit({ type: "files", repo: ctx.key });
}

function pickCommand(mode: "cherry-pick" | "revert"): Command {
  return (ctx, argv) => {
    requireRepo(ctx);
    const a = parseArgs(argv, {
      bool: ["--continue", "--abort", "--skip", "--quit", "--no-edit", "-n", "--no-commit", "-x", "--edit", "-e"],
      value: ["-m", "--mainline"],
      alias: { "--no-commit": "-n", "--mainline": "-m" },
    });
    const repo = ctx.repo;
    const op = repo.op;
    if (a.has("--abort") || a.has("--quit")) {
      if (op?.kind !== mode) fail(`error: no ${mode} in progress`);
      const orig = repo.origHead!;
      if (a.has("--abort")) {
        if (headId(repo) !== orig) moveHead(repo, orig, `${mode}: abort`);
        hardReset(repo, treeOf(repo, orig));
      }
      repo.op = null;
      ctx.emit({ type: "files", repo: ctx.key });
      return;
    }
    if (a.has("--continue") || a.has("--skip")) {
      if (op?.kind !== mode) fail(`error: no ${mode} in progress`);
      if (op!.kind !== mode) return;
      if (a.has("--skip")) {
        hardReset(repo, headTree(repo));
        op!.unmerged = [];
      } else {
        if (op!.unmerged.length) fail("error: Committing is not possible because you have unmerged files.", "hint: fix conflicts, git add them, then continue");
        if (op!.commit && !sameTree(repo.index, headTree(repo))) {
          const src = repo.commits[op!.commit];
          const nc = writeCommit(ctx.world, repo, { parents: [headId(repo)!], message: op!.message, tree: repo.index, author: mode === "cherry-pick" ? src.author : undefined });
          moveHead(repo, nc.id, `${mode}: ${firstLine(op!.message)}`);
          ctx.out(commitBanner(repo, nc.id, false), "success");
          ctx.emit({ type: "commit", repo: ctx.key, id: nc.id });
        }
      }
      const remaining = [...op!.remaining];
      repo.op = null;
      return runPicks(ctx, mode, remaining);
    }
    requireNoOp(ctx);
    if (!a.pos.length) fail(`usage: git ${mode} <commit>...`);
    const head = requireCommit(ctx);
    const st = status(repo);
    if (st.staged.length) fail(`error: your local changes would be overwritten by ${mode}.`, "hint: commit your changes or stash them to proceed.", `fatal: ${mode} failed`);
    const ids: Id[] = [];
    for (const p of a.pos) {
      if (p.includes("..")) {
        const [x, y] = p.split("..");
        ids.push(...rangeCommits(repo, resolveRev(repo, y || "HEAD"), [resolveRev(repo, x)]));
      } else ids.push(resolveRev(repo, p));
    }
    if (mode === "revert" && ids.length > 1) ids.reverse();
    repo.origHead = head;
    const mainline = a.value("-m") ? Number(a.value("-m")) : undefined;
    return runPicks(ctx, mode, ids, mainline, a.has("-n"));
  };
}

export const cherryPick = pickCommand("cherry-pick");
export const revert = pickCommand("revert");

// ---------- rebase ----------

function patchKey(repo: Repo, id: Id): string {
  const c = repo.commits[id];
  const before = treeOf(repo, c.parents[0] ?? null);
  const paths = [...new Set([...Object.keys(before), ...Object.keys(c.tree)])].sort().filter((p) => before[p] !== c.tree[p]);
  return JSON.stringify(paths.map((p) => [p, before[p] ?? null, c.tree[p] ?? null]));
}

/** The commits `git rebase <upstream>` would replay, minus ones already upstream. */
export function rebasePlan(repo: Repo, upstream: Id, head: Id): { steps: RebaseStep[]; skipped: Id[] } {
  const mine = rangeCommits(repo, head, [upstream]).filter((id) => repo.commits[id].parents.length <= 1);
  const theirs = new Set(rangeCommits(repo, upstream, [head]).map((id) => patchKey(repo, id)));
  const skipped = mine.filter((id) => theirs.has(patchKey(repo, id)));
  return { steps: mine.filter((id) => !skipped.includes(id)).map((id) => ({ action: "pick", id })), skipped };
}

export function startRebase(ctx: Ctx, onto: Id, steps: RebaseStep[], label: string): number | void {
  const repo = ctx.repo;
  const head = headId(repo)!;
  const firstReal = steps.find((s) => s.action !== "drop");
  if (firstReal && (firstReal.action === "squash" || firstReal.action === "fixup"))
    fail(`error: cannot '${firstReal.action}' without a previous commit`, "hint: the first commit in the list must be pick or reword");
  const branch = currentBranch(repo);
  // Already in place? (linear chain on top of onto, nothing dropped or edited)
  const ids = steps.map((s) => s.id);
  const unchanged =
    steps.every((s) => s.action === "pick") &&
    ids.length > 0 &&
    ids[ids.length - 1] === head &&
    repo.commits[ids[0]].parents[0] === onto &&
    ids.every((id, i) => i === 0 || repo.commits[id].parents.length === 1 && repo.commits[id].parents[0] === ids[i - 1]);
  if (unchanged || (!ids.length && head === onto)) {
    ctx.out(`Current branch ${branch ?? "HEAD"} is up to date.`);
    return;
  }
  repo.origHead = head;
  repo.op = { kind: "rebase", branch, origHead: head, onto, todo: [...steps], current: null, unmerged: [], versions: {} };
  checkoutTree(repo, repo.commits[onto].tree, "rebase");
  setHead(repo, { kind: "detached", id: onto }, `rebase (start): checkout ${label}`);
  ctx.emit({ type: "head", repo: ctx.key });
  return continueRebase(ctx);
}

function continueRebase(ctx: Ctx): number | void {
  const repo = ctx.repo;
  const op = repo.op;
  if (op?.kind !== "rebase") return;
  while (op.todo.length) {
    const step = op.todo.shift()!;
    if (step.action === "drop") continue;
    const c = repo.commits[step.id];
    const res = mergeTrees(treeOf(repo, c.parents[0] ?? null), headTree(repo), c.tree, pickLabels(c, "pick"));
    applyTreeMerge(ctx, res, "rebase");
    if (res.conflicts.length) {
      op.current = step;
      op.unmerged = [...res.conflicts];
      op.versions = res.versions;
      res.messages.forEach((m) => ctx.out(m, m.startsWith("CONFLICT") ? "error" : "normal"));
      ctx.out(`error: could not apply ${short(c.id)}... ${firstLine(c.message)}`, "error");
      ctx.out(
        'hint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: You can instead skip this commit: run "git rebase --skip".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
        "hint",
      );
      ctx.emit({ type: "conflict", repo: ctx.key, paths: res.conflicts });
      ctx.emit({ type: "files", repo: ctx.key });
      return 1;
    }
    commitStep(ctx, step);
  }
  return finishRebase(ctx);
}

function commitStep(ctx: Ctx, step: RebaseStep) {
  const repo = ctx.repo;
  const c = repo.commits[step.id];
  const head = headId(repo)!;
  const h = repo.commits[head];
  if (step.action === "squash" || step.action === "fixup") {
    const message = step.message ?? (step.action === "squash" ? `${h.message}\n\n${c.message}` : h.message);
    const nc = writeCommit(ctx.world, repo, { parents: h.parents, message, tree: repo.index, author: h.author });
    moveHead(repo, nc.id, `rebase (${step.action}): ${firstLine(message)}`);
    ctx.emit({ type: "commit", repo: ctx.key, id: nc.id });
    return;
  }
  if (sameTree(repo.index, headTree(repo))) {
    ctx.out(`dropping ${short(c.id)} ${firstLine(c.message)} -- patch contents already upstream`, "muted");
    return;
  }
  const message = step.message ?? c.message;
  const nc = writeCommit(ctx.world, repo, { parents: [head], message, tree: repo.index, author: c.author });
  moveHead(repo, nc.id, `rebase (${step.action}): ${firstLine(message)}`);
  ctx.emit({ type: "commit", repo: ctx.key, id: nc.id });
}

function finishRebase(ctx: Ctx) {
  const repo = ctx.repo;
  const op = repo.op;
  if (op?.kind !== "rebase") return;
  const final = headId(repo)!;
  repo.op = null;
  if (op.branch) {
    const prev = repo.branches[op.branch] ?? null;
    repo.branches[op.branch] = final;
    repo.reflog[op.branch] = [{ id: final, prev, message: `rebase (finish): refs/heads/${op.branch} onto ${op.onto}` }, ...(repo.reflog[op.branch] ?? [])];
    setHead(repo, { kind: "branch", name: op.branch }, `rebase (finish): returning to refs/heads/${op.branch}`);
    ctx.emit({ type: "ref", repo: ctx.key, ref: op.branch, from: prev, to: final });
    ctx.out(`Successfully rebased and updated refs/heads/${op.branch}.`, "success");
  } else ctx.out("Successfully rebased and updated detached HEAD.", "success");
  ctx.emit({ type: "head", repo: ctx.key });
  ctx.emit({ type: "files", repo: ctx.key });
}

export const rebase: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["--continue", "--abort", "--skip", "--quit", "-i", "--interactive", "--autosquash", "--root"],
    value: ["--onto"],
    alias: { "--interactive": "-i" },
  });
  const repo = ctx.repo;
  const op = repo.op;
  if (a.has("--abort") || a.has("--quit")) {
    if (op?.kind !== "rebase") fail("fatal: No rebase in progress?");
    if (op!.kind !== "rebase") return;
    if (a.has("--abort")) {
      hardReset(repo, treeOf(repo, op!.origHead));
      repo.op = null;
      if (op!.branch) setHead(repo, { kind: "branch", name: op!.branch }, `rebase (abort): returning to refs/heads/${op!.branch}`);
      else setHead(repo, { kind: "detached", id: op!.origHead }, "rebase (abort)");
    } else repo.op = null;
    ctx.emit({ type: "head", repo: ctx.key });
    ctx.emit({ type: "files", repo: ctx.key });
    return;
  }
  if (a.has("--continue") || a.has("--skip")) {
    if (op?.kind !== "rebase") fail("fatal: No rebase in progress?");
    if (op!.kind !== "rebase") return;
    if (a.has("--skip")) {
      hardReset(repo, headTree(repo));
      op!.unmerged = [];
      op!.current = null;
    } else {
      if (op!.unmerged.length)
        fail("error: you must edit all merge conflicts and then", "mark them as resolved using git add", ...op!.unmerged.map((p) => `hint: unresolved: ${p}`));
      const st = status(repo);
      if (st.unstaged.length) fail("error: cannot continue: You have unstaged changes.", "hint: git add them (or git restore them) first");
      if (op!.current) commitStep(ctx, op!.current);
      op!.current = null;
    }
    return continueRebase(ctx);
  }
  requireNoOp(ctx);
  if (a.pos.length > 1) {
    // git rebase <upstream> <branch> — switch to <branch> first
    const b = a.pos[1];
    if (!repo.branches[b]) fail(`fatal: invalid upstream '${b}'`);
    if (currentBranch(repo) !== b) {
      checkoutTree(repo, repo.commits[repo.branches[b]].tree);
      setHead(repo, { kind: "branch", name: b }, `checkout: moving from ${currentBranch(repo) ?? "HEAD"} to ${b}`);
    }
  }
  const head = requireCommit(ctx);
  const st = status(repo);
  if (st.unstaged.length) fail("error: cannot rebase: You have unstaged changes.", "error: Please commit or stash them.");
  if (st.staged.length) fail("error: cannot rebase: Your index contains uncommitted changes.", "error: Please commit or stash them.");
  let upstreamRev = a.pos[0];
  if (!upstreamRev) {
    const b = currentBranch(repo);
    const up = b ? repo.upstream[b] : undefined;
    if (!up)
      fail("There is no tracking information for the current branch.", "Please specify which branch you want to rebase against.", "", "    git rebase <branch>");
    upstreamRev = `${up!.remote}/${up!.branch}`;
  }
  const upstream = resolveRev(repo, upstreamRev);
  const onto = a.value("--onto") ? resolveRev(repo, a.value("--onto")!) : upstream;
  const { steps, skipped } = rebasePlan(repo, upstream, head);
  if (a.has("-i")) {
    if (!steps.length) {
      ctx.out("branchwise: nothing to rebase — no commits between that base and HEAD.", "hint");
      return;
    }
    ctx.emit({ type: "open-rebase-editor", repo: ctx.key, upstream: upstreamRev, onto, steps });
    ctx.out(`hint: edit the todo list for ${plural(steps.length, "commit")} in the panel, then press "Start rebase".`, "hint");
    return;
  }
  for (const s of skipped) ctx.out(`warning: skipped previously applied commit ${short(s)}`, "warn");
  if (skipped.length) ctx.out("hint: use --reapply-cherry-picks to include skipped commits", "hint");
  if (!steps.length && isAncestor(repo, head, onto)) {
    // nothing of ours to replay: fast-forward
    const branch = currentBranch(repo);
    checkoutTree(repo, repo.commits[onto].tree, "rebase");
    moveHead(repo, onto, `rebase (finish): ${branch ?? "HEAD"} onto ${onto}`);
    ctx.out(`Successfully rebased and updated refs/heads/${branch}.`, "success");
    ctx.emit({ type: "ref", repo: ctx.key, ref: branch ?? "HEAD", from: head, to: onto });
    ctx.emit({ type: "files", repo: ctx.key });
    return;
  }
  return startRebase(ctx, onto, steps, upstreamRev);
};

// ---------- reset ----------

export const reset: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--soft", "--mixed", "--hard", "--merge", "--keep", "-q"] });
  const repo = ctx.repo;
  const first = a.pos[0];
  const firstIsRev = first !== undefined && resolveSafe(repo, first) !== null;
  const paths = [...(firstIsRev ? a.pos.slice(1) : a.pos), ...a.paths];
  if (paths.length) {
    if (a.has("--hard") || a.has("--soft")) fail(`fatal: Cannot do ${a.has("--hard") ? "hard" : "soft"} reset with paths.`);
    const src = treeOf(repo, firstIsRev ? resolveRev(repo, first) : headId(repo));
    const known = [...new Set([...Object.keys(src), ...Object.keys(repo.index)])];
    const changed: string[] = [];
    for (const spec of paths) {
      const m = matchPaths(spec, known);
      if (!m.length) fail(`error: pathspec '${spec}' did not match any file(s) known to git`);
      for (const p of m) {
        if (repo.index[p] !== src[p]) changed.push(p);
        if (p in src) repo.index[p] = src[p];
        else delete repo.index[p];
      }
    }
    const left = status(repo).unstaged;
    if (left.length) {
      ctx.out("Unstaged changes after reset:");
      left.forEach((u) => ctx.out(`${u.kind === "deleted" ? "D" : "M"}\t${u.path}`));
    }
    ctx.emit({ type: "files", repo: ctx.key });
    return;
  }
  const head = requireCommit(ctx);
  const target = first ? resolveRev(repo, first) : head;
  const mode = a.has("--soft") ? "soft" : a.has("--hard") ? "hard" : "mixed";
  if (mode === "soft" && repo.op?.kind === "merge") fail("fatal: Cannot do a soft reset in the middle of a merge.");
  repo.origHead = head;
  moveHead(repo, target, `reset: moving to ${first ?? "HEAD"}`);
  if (repo.op && repo.op.kind !== "rebase" && mode !== "soft") repo.op = null;
  if (mode === "mixed") {
    repo.index = { ...repo.commits[target].tree };
    const left = status(repo).unstaged;
    if (left.length && !a.has("-q")) {
      ctx.out("Unstaged changes after reset:");
      left.forEach((u) => ctx.out(`${u.kind === "deleted" ? "D" : "M"}\t${u.path}`));
    }
  } else if (mode === "hard") {
    hardReset(repo, repo.commits[target].tree);
    repo.op = repo.op?.kind === "rebase" ? repo.op : null;
    ctx.out(`HEAD is now at ${short(target)} ${firstLine(repo.commits[target].message)}`);
  }
  ctx.emit({ type: "ref", repo: ctx.key, ref: currentBranch(repo) ?? "HEAD", from: head, to: target });
  ctx.emit({ type: "files", repo: ctx.key });
};

function resolveSafe(repo: Repo, rev: string): Id | null {
  try {
    return resolveRev(repo, rev);
  } catch {
    return null;
  }
}

// ---------- stash ----------

function stashIndex(spec: string | undefined, repo: Repo): number {
  if (!spec) return 0;
  const m = /^(?:stash@\{)?(\d+)\}?$/.exec(spec);
  const n = m ? Number(m[1]) : NaN;
  if (Number.isNaN(n) || !repo.stash[n]) fail(`error: ${spec} is not a valid reference`);
  return n;
}

export const stash: Command = (ctx, argv) => {
  requireRepo(ctx);
  const sub = argv[0] && !argv[0].startsWith("-") ? argv[0] : "push";
  const rest = sub === argv[0] ? argv.slice(1) : argv;
  const repo = ctx.repo;
  const a = parseArgs(rest, {
    bool: ["-u", "--include-untracked", "-a", "--all", "--index", "-q", "-p", "--keep-index", "-k"],
    value: ["-m", "--message"],
    alias: { "--include-untracked": "-u", "--message": "-m", "--all": "-a", "--keep-index": "-k" },
  });
  switch (sub) {
    case "push":
    case "save": {
      const head = requireCommit(ctx);
      if (repo.op?.unmerged.length) fail(`${repo.op.unmerged[0]}: needs merge`, "error: could not write index");
      const ht = headTree(repo);
      const st = status(repo);
      const untracked = a.has("-u") || a.has("-a") ? st.untracked : [];
      if (!st.staged.length && !st.unstaged.length && !untracked.length) {
        ctx.out("No local changes to save");
        return;
      }
      const wd: Tree = {};
      for (const p of Object.keys(repo.index)) if (p in repo.workdir) wd[p] = repo.workdir[p];
      for (const p of untracked) wd[p] = repo.workdir[p];
      const b = currentBranch(repo) ?? "(no branch)";
      const custom = a.value("-m") ?? (sub === "save" ? a.pos.join(" ") : "");
      const message = custom ? `On ${b}: ${custom}` : `WIP on ${b}: ${short(head)} ${firstLine(repo.commits[head].message)}`;
      const c = writeCommit(ctx.world, repo, { parents: [head], message, tree: wd, kind: "stash" });
      repo.stash.unshift({ id: c.id, base: head, branch: b, message, index: { ...repo.index }, workdir: wd });
      // put tracked files back to HEAD; drop stashed untracked files
      for (const p of Object.keys(repo.index)) if (!(p in ht)) delete repo.workdir[p];
      for (const p of untracked) delete repo.workdir[p];
      if (a.has("-k")) {
        for (const [p, v] of Object.entries(repo.index)) repo.workdir[p] = v;
      } else {
        repo.index = { ...ht };
        for (const [p, v] of Object.entries(ht)) repo.workdir[p] = v;
      }
      ctx.out(`Saved working directory and index state ${message}`);
      ctx.emit({ type: "files", repo: ctx.key });
      return;
    }
    case "list":
      repo.stash.forEach((s, i) => ctx.out(`stash@{${i}}: ${s.message}`));
      return;
    case "show": {
      const s = repo.stash[stashIndex(a.pos[0], repo)];
      diffStat(treeOf(repo, s.base), { ...treeOf(repo, s.base), ...s.workdir }).forEach((l) => ctx.out(l));
      return;
    }
    case "drop": {
      const i = stashIndex(a.pos[0], repo);
      const [s] = repo.stash.splice(i, 1);
      ctx.out(`Dropped refs/stash@{${i}} (${s.id})`);
      return;
    }
    case "clear":
      repo.stash = [];
      return;
    case "apply":
    case "pop": {
      if (!repo.stash.length) fail("error: No stash entries found.");
      const i = stashIndex(a.pos[0], repo);
      const s = repo.stash[i];
      const conflicted = applyStash(ctx, i);
      if (sub === "pop" && !conflicted) {
        repo.stash.splice(i, 1);
        ctx.out(`Dropped refs/stash@{${i}} (${s.id})`);
      } else if (conflicted) ctx.out("The stash entry is kept in case you need it again.", "warn");
      return conflicted ? 1 : 0;
    }
    case "branch": {
      const name = a.pos[0];
      if (!name) fail("fatal: No branch name specified");
      const i = stashIndex(a.pos[1], repo);
      const s = repo.stash[i];
      repo.branches[name] = s.base;
      checkoutTree(repo, treeOf(repo, s.base));
      setHead(repo, { kind: "branch", name }, `checkout: moving to ${name}`);
      ctx.out(`Switched to a new branch '${name}'`);
      if (!applyStash(ctx, i)) {
        repo.stash.splice(i, 1);
        ctx.out(`Dropped refs/stash@{${i}} (${s.id})`);
      }
      ctx.emit({ type: "head", repo: ctx.key });
      return;
    }
    default:
      fail(`error: unknown subcommand: \`${sub}'`, "usage: git stash list | show | drop | pop | apply | branch | push | clear");
  }
};

/** Returns true when it left conflicts. */
function applyStash(ctx: Ctx, i: number): boolean {
  const repo = ctx.repo;
  const s = repo.stash[i];
  const base = treeOf(repo, s.base);
  const head = headTree(repo);
  const stashed: Tree = { ...s.workdir };
  const paths = [...new Set([...Object.keys(base), ...Object.keys(stashed), ...Object.keys(s.index)])].filter(
    (p) => base[p] !== stashed[p] || (p in s.index && !(p in base)),
  );
  const dirty = paths.filter((p) => (p in head || p in repo.index) && (repo.workdir[p] !== head[p] || repo.index[p] !== head[p]) && repo.workdir[p] !== stashed[p]);
  if (dirty.length)
    fail("error: Your local changes to the following files would be overwritten by merge:", ...dirty.map((p) => `\t${p}`), "Please commit your changes or stash them before you merge.", "Aborting");
  const res = mergeTrees(
    Object.fromEntries(paths.filter((p) => p in base).map((p) => [p, base[p]])),
    Object.fromEntries(paths.filter((p) => p in head).map((p) => [p, head[p]])),
    Object.fromEntries(paths.filter((p) => p in stashed).map((p) => [p, stashed[p]])),
    { ours: "Updated upstream", theirs: "Stashed changes" },
  );
  for (const p of paths) {
    if (p in res.workdir) repo.workdir[p] = res.workdir[p];
    else delete repo.workdir[p];
    if (!(p in res.tree) && p in repo.index && !res.conflicts.includes(p)) delete repo.index[p];
    if (p in s.index && !(p in head) && p in res.tree && !res.conflicts.includes(p)) repo.index[p] = res.tree[p];
  }
  res.conflicts.forEach((p) => ctx.out(`CONFLICT (content): Merge conflict in ${p}`, "error"));
  const st = status(repo);
  if (!res.conflicts.length) {
    const b = currentBranch(repo);
    if (b) ctx.out(`On branch ${b}`);
    if (st.staged.length) {
      ctx.out("Changes to be committed:");
      st.staged.forEach((x) => ctx.out(`\t${(x.kind + ":").padEnd(12)}${x.path}`, "success"));
    }
    if (st.unstaged.length) {
      ctx.out("Changes not staged for commit:");
      st.unstaged.forEach((x) => ctx.out(`\t${(x.kind + ":").padEnd(12)}${x.path}`, "error"));
    }
    if (st.untracked.length) {
      ctx.out("Untracked files:");
      st.untracked.forEach((x) => ctx.out(`\t${x}`, "error"));
    }
  }
  ctx.emit({ type: "files", repo: ctx.key });
  return res.conflicts.length > 0;
}

// ---------- tests + bisect ----------

/** `npm test`: fails when the rule's file contains the bug marker. */
export function runTests(ctx: Ctx, quiet = false): number {
  const rule = ctx.world.testRule;
  if (!rule) {
    if (!quiet) ctx.out('npm ERR! Missing script: "test"', "error");
    return 1;
  }
  const content = ctx.repo.workdir[rule.path] ?? "";
  const failed = content.includes(rule.failsWhen);
  if (!quiet) {
    ctx.out(`> project@1.0.0 test\n> node --test\n`, "muted");
    if (failed) {
      ctx.out(`✖ ${rule.path} works as expected`, "error");
      ctx.out(`  AssertionError: found "${rule.failsWhen}" in ${rule.path}`, "error");
      ctx.out("ℹ tests 1  pass 0  fail 1", "error");
    } else {
      ctx.out(`✔ ${rule.path} works as expected`, "success");
      ctx.out("ℹ tests 1  pass 1  fail 0", "success");
    }
  }
  return failed ? 1 : 0;
}

function bisectStep(ctx: Ctx): "found" | "waiting" | "moved" {
  const repo = ctx.repo;
  const b = repo.bisect!;
  if (!b.bad || !b.good.length) {
    ctx.out(`status: waiting for ${!b.bad ? "bad" : "good"} commit${b.bad ? "(s)" : ""}, ${b.bad ? "bad" : b.good.length ? "good" : "no"} commit known`, "muted");
    return "waiting";
  }
  const cands = rangeCommits(repo, b.bad, b.good);
  if (cands.length <= 1) {
    const id = cands[0] ?? b.bad;
    const c = repo.commits[id];
    ctx.out(`${id} is the first bad commit`, "success");
    ctx.out(`commit ${id}\nAuthor: ${c.author}\n\n    ${firstLine(c.message)}\n`);
    b.current = null;
    return "found";
  }
  const set = new Set(cands);
  let best = cands[0];
  let bestScore = -1;
  for (const id of cands) {
    const reach = [...ancestors(repo, id)].filter((x) => set.has(x)).length;
    const score = Math.min(reach, cands.length - reach);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  const left = Math.floor(cands.length / 2);
  const steps = Math.max(0, Math.ceil(Math.log2(cands.length)) - 1);
  checkoutTree(repo, repo.commits[best].tree, "checkout");
  setHead(repo, { kind: "detached", id: best }, `checkout: moving to ${best}`);
  b.current = best;
  ctx.out(`Bisecting: ${plural(left, "revision")} left to test after this (roughly ${plural(steps, "step")})`);
  ctx.out(`[${best}] ${firstLine(repo.commits[best].message)}`);
  ctx.emit({ type: "head", repo: ctx.key });
  ctx.emit({ type: "files", repo: ctx.key });
  return "moved";
}

export const bisect: Command = (ctx, argv) => {
  requireRepo(ctx);
  const repo = ctx.repo;
  const [sub, ...args] = argv;
  const need = () => {
    if (!repo.bisect) fail("You need to start by \"git bisect start\"", "hint: git bisect start <bad> <good>");
    return repo.bisect!;
  };
  switch (sub) {
    case "start": {
      requireCommit(ctx);
      if (!isClean(status(repo))) fail("error: you have local changes — commit or stash them before bisecting");
      repo.bisect = { bad: null, good: [], origHead: { ...repo.head }, current: null };
      if (args[0]) repo.bisect.bad = resolveRev(repo, args[0]);
      for (const g of args.slice(1)) repo.bisect.good.push(resolveRev(repo, g));
      bisectStep(ctx);
      return;
    }
    case "bad":
    case "new": {
      const b = need();
      b.bad = resolveRev(repo, args[0] ?? "HEAD");
      bisectStep(ctx);
      return;
    }
    case "good":
    case "old": {
      const b = need();
      b.good.push(resolveRev(repo, args[0] ?? "HEAD"));
      bisectStep(ctx);
      return;
    }
    case "skip":
      fail("branchwise: bisect skip isn't simulated — mark the commit good or bad.");
      return;
    case "run": {
      const b = need();
      if (!args.length) fail("error: bisect run failed: no command provided.");
      for (let guard = 0; guard < 64; guard++) {
        if (!b.bad || !b.good.length) fail("error: bisect run needs a known good and bad commit first");
        ctx.out(`running '${args.join(" ")}'`, "muted");
        const code = runTests(ctx, true);
        if (code) b.bad = headId(repo);
        else b.good.push(headId(repo)!);
        const r = bisectStep(ctx);
        if (r === "found") {
          ctx.out("bisect found first bad commit", "success");
          return;
        }
      }
      return;
    }
    case "reset": {
      const b = need();
      const target = b.origHead;
      const id = target.kind === "branch" ? repo.branches[target.name] : target.id;
      const from = headId(repo)!;
      checkoutTree(repo, treeOf(repo, id), "checkout");
      setHead(repo, target, `checkout: moving from ${short(from)} to ${target.kind === "branch" ? target.name : id}`);
      repo.bisect = null;
      ctx.out(`Previous HEAD position was ${short(from)} ${firstLine(repo.commits[from].message)}`);
      ctx.out(target.kind === "branch" ? `Switched to branch '${target.name}'` : `HEAD is now at ${short(id)}`);
      ctx.emit({ type: "head", repo: ctx.key });
      ctx.emit({ type: "files", repo: ctx.key });
      return;
    }
    case "log": {
      const b = need();
      if (b.bad) ctx.out(`# bad: [${b.bad}]`);
      b.good.forEach((g) => ctx.out(`# good: [${g}]`));
      return;
    }
    default:
      fail("usage: git bisect [start|bad|good|reset|run|log]");
  }
};
