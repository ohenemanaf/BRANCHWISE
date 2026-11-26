import { type Ctx, plural } from "./context";
import { short } from "./hash";
import { ancestors, emptyRepo, fail, firstLine, mergeBase, mergeTrees, rangeCommits, treeOf, writeCommit } from "./repo";
import type { ActionRun, GhRepo, Id, PullRequest, Repo, RunStep, Tree, World } from "./types";

export const ghUrl = (g: GhRepo) => `https://github.com/${g.owner}/${g.name}.git`;
export const ghWeb = (g: GhRepo) => `https://github.com/${g.owner}/${g.name}`;

/** Accepts https://github.com/o/n(.git), github.com/o/n, git@github.com:o/n.git, o/n */
export function findGh(world: World, url: string): GhRepo | null {
  const m = /(?:github\.com[/:])?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!m) return null;
  return Object.values(world.github.repos).find((g) => g.owner === m[1] && g.name === m[2]) ?? null;
}

export function createGhRepo(world: World, key: string, owner: string, name: string, opts: { forkOf?: string } = {}): GhRepo {
  const g: GhRepo = { key, owner, name, forkOf: opts.forkOf ?? null, defaultBranch: "main", protection: {} };
  world.github.repos[key] = g;
  const r = emptyRepo(`${owner}/${name}`, { bare: true });
  world.repos[key] = r;
  return g;
}

/** Copy every commit reachable from `tips` that `to` lacks. Returns the copied ids, oldest first. */
export function copyObjects(from: Repo, to: Repo, tips: Id[]): Id[] {
  const copied: Id[] = [];
  for (const t of tips) {
    for (const id of ancestors(from, t)) {
      if (!to.commits[id]) {
        to.commits[id] = structuredClone(from.commits[id]);
        copied.push(id);
      }
    }
  }
  return copied.sort((a, b) => from.commits[a].time - from.commits[b].time);
}

// ---------- Actions ----------

export function testFails(world: World, tree: Tree): boolean {
  const r = world.testRule;
  return !!r && (tree[r.path] ?? "").includes(r.failsWhen);
}

interface ParsedWorkflow {
  name: string;
  on: string;
  steps: { name: string | null; uses: string | null; run: string | null }[];
}

export function parseWorkflow(yaml: string, path: string): ParsedWorkflow {
  const name = /^name:\s*["']?(.+?)["']?\s*$/m.exec(yaml)?.[1] ?? path.split("/").pop()!.replace(/\.ya?ml$/, "");
  const onBlock = /^on:\s*(.*)$/m.exec(yaml);
  let on = onBlock?.[1] ?? "";
  if (onBlock && !on.trim()) {
    const after = yaml.slice(onBlock.index + onBlock[0].length).split("\n");
    const sub: string[] = [];
    for (const l of after) {
      if (/^\S/.test(l)) break;
      sub.push(l);
    }
    on = sub.join(" ");
  }
  const steps: ParsedWorkflow["steps"] = [];
  let inSteps = false;
  for (const raw of yaml.split("\n")) {
    if (/^\s*steps:\s*$/.test(raw)) {
      inSteps = true;
      continue;
    }
    if (!inSteps) continue;
    const start = /^\s*-\s+(name|uses|run):\s*(.*)$/.exec(raw);
    const cont = /^\s+(name|uses|run):\s*(.*)$/.exec(raw);
    if (start) steps.push({ name: null, uses: null, run: null, [start[1]]: start[2].replace(/^["']|["']$/g, "") });
    else if (cont && steps.length) Object.assign(steps[steps.length - 1], { [cont[1]]: cont[2].replace(/^["']|["']$/g, "") });
  }
  return { name, on, steps };
}

/** Run every workflow in the commit's tree that listens to `event`. */
export function triggerWorkflows(ctx: Ctx | null, world: World, ghKey: string, branch: string, sha: Id, event: "push" | "pull_request"): ActionRun[] {
  const repo = world.repos[ghKey];
  const tree = repo.commits[sha]?.tree ?? {};
  const files = Object.keys(tree).filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)).sort();
  const made: ActionRun[] = [];
  for (const f of files) {
    const wf = parseWorkflow(tree[f], f);
    if (!wf.on.includes(event)) continue;
    let failed = false;
    const steps: RunStep[] = wf.steps.map((s) => {
      const label = s.name ?? (s.uses ? `Run ${s.uses}` : `Run ${s.run}`);
      if (failed) return { name: label, command: s.run, status: "skipped", log: [] };
      if (s.uses) return { name: label, command: null, status: "success", log: [`Using ${s.uses}`] };
      const cmd = s.run ?? "";
      let ok = true;
      const log = [`$ ${cmd}`];
      if (/\btest\b/.test(cmd)) {
        ok = !testFails(world, tree);
        log.push(ok ? "✔ tests 1  pass 1  fail 0" : `✖ found "${world.testRule?.failsWhen}" in ${world.testRule?.path}`, ok ? "" : "Error: Process completed with exit code 1.");
      } else if (/exit 1|false/.test(cmd)) {
        ok = false;
        log.push("Error: Process completed with exit code 1.");
      } else log.push("done");
      if (!ok) failed = true;
      return { name: label, command: cmd, status: ok ? "success" : "failure", log: log.filter(Boolean) };
    });
    const run: ActionRun = {
      id: world.github.runs.length + 1,
      repo: ghKey,
      branch,
      sha,
      workflow: wf.name,
      event,
      status: failed ? "failure" : "success",
      steps,
    };
    world.github.runs.push(run);
    made.push(run);
    ctx?.emit({ type: "run", id: run.id });
  }
  return made;
}

export function latestRun(world: World, sha: Id): ActionRun | null {
  const runs = world.github.runs.filter((r) => r.sha === sha);
  return runs.length ? runs[runs.length - 1] : null;
}

// ---------- pull requests ----------

export function prHeadTip(world: World, pr: PullRequest): Id | null {
  return world.repos[pr.headRepo]?.branches[pr.head] ?? null;
}

export function approvals(pr: PullRequest) {
  const latest = new Map<string, string>();
  for (const r of pr.reviews) if (r.state !== "commented") latest.set(r.author, r.state);
  const states = [...latest.values()];
  return { approved: states.filter((s) => s === "approved").length, changesRequested: states.includes("changes_requested") };
}

export interface Mergeability {
  ok: boolean;
  reasons: string[];
  conflicts: string[];
}

export function prMergeability(world: World, pr: PullRequest): Mergeability {
  const baseRepo = world.repos[pr.repo];
  const gh = world.github.repos[pr.repo];
  const reasons: string[] = [];
  const headTip = prHeadTip(world, pr);
  const baseTip = baseRepo.branches[pr.base];
  if (!headTip) return { ok: false, reasons: [`head branch '${pr.head}' no longer exists`], conflicts: [] };
  const scratch: Repo = { ...baseRepo, commits: { ...baseRepo.commits } };
  copyObjects(world.repos[pr.headRepo], scratch, [headTip]);
  const base = mergeBase(scratch, baseTip, headTip);
  const res = mergeTrees(treeOf(scratch, base), scratch.commits[baseTip].tree, scratch.commits[headTip].tree, { ours: pr.base, theirs: pr.head });
  if (res.conflicts.length) reasons.push(`This branch has conflicts that must be resolved (${res.conflicts.join(", ")})`);
  const rule = gh.protection[pr.base];
  if (rule?.requireApproval) {
    const a = approvals(pr);
    if (a.changesRequested) reasons.push("Changes requested by a reviewer");
    else if (!a.approved) reasons.push("Review required: at least 1 approving review");
  }
  if (rule?.requireChecks) {
    const run = latestRun(world, headTip);
    if (!run) reasons.push("Required status checks have not run");
    else if (run.status !== "success") reasons.push(`Required check failed: ${run.workflow}`);
  }
  return { ok: !reasons.length, reasons, conflicts: res.conflicts };
}

export function findPr(world: World, n: number): PullRequest {
  const pr = world.github.prs.find((p) => p.number === n);
  if (!pr) fail(`GraphQL: Could not resolve to a PullRequest with the number of ${n}. (repository.pullRequest)`);
  return pr!;
}

/** Perform the merge on the base repo. Returns the new base tip. */
export function mergePr(world: World, pr: PullRequest, method: "merge" | "squash" | "rebase", merger: string): Id {
  const baseRepo = world.repos[pr.repo];
  const headRepo = world.repos[pr.headRepo];
  const headTip = headRepo.branches[pr.head];
  const baseTip = baseRepo.branches[pr.base];
  copyObjects(headRepo, baseRepo, [headTip]);
  const headGh = world.github.repos[pr.headRepo];
  let tip: Id;
  if (method === "merge") {
    const base = mergeBase(baseRepo, baseTip, headTip);
    const res = mergeTrees(treeOf(baseRepo, base), baseRepo.commits[baseTip].tree, baseRepo.commits[headTip].tree, { ours: pr.base, theirs: pr.head });
    tip = writeCommit(world, baseRepo, {
      parents: [baseTip, headTip],
      message: `Merge pull request #${pr.number} from ${headGh.owner}/${pr.head}\n\n${pr.title}`,
      tree: res.tree,
      author: merger,
    }).id;
  } else if (method === "squash") {
    const base = mergeBase(baseRepo, baseTip, headTip);
    const res = mergeTrees(treeOf(baseRepo, base), baseRepo.commits[baseTip].tree, baseRepo.commits[headTip].tree, { ours: pr.base, theirs: pr.head });
    tip = writeCommit(world, baseRepo, { parents: [baseTip], message: `${pr.title} (#${pr.number})`, tree: res.tree, author: pr.author }).id;
  } else {
    tip = baseTip;
    for (const id of rangeCommits(baseRepo, headTip, [baseTip])) {
      const c = baseRepo.commits[id];
      if (c.parents.length > 1) continue;
      const res = mergeTrees(treeOf(baseRepo, c.parents[0] ?? null), baseRepo.commits[tip].tree, c.tree, { ours: pr.base, theirs: pr.head });
      tip = writeCommit(world, baseRepo, { parents: [tip], message: c.message, tree: res.tree, author: c.author }).id;
    }
  }
  baseRepo.branches[pr.base] = tip;
  pr.state = "merged";
  pr.mergedAs = tip;
  pr.method = method;
  return tip;
}

// ---------- teammate simulation (used by lessons, scenarios and the sandbox button) ----------

/** A teammate commits straight to a branch on a GitHub repo. `files` values of null delete. */
export function teammateCommit(
  world: World,
  ghKey: string,
  branch: string,
  files: Record<string, string | null>,
  message: string,
  author = world.teammate,
): Id {
  const repo = world.repos[ghKey];
  const parent = repo.branches[branch] ?? null;
  const tree: Tree = { ...treeOf(repo, parent) };
  for (const [p, v] of Object.entries(files)) {
    if (v === null) delete tree[p];
    else tree[p] = v;
  }
  const c = writeCommit(world, repo, { parents: parent ? [parent] : [], message, tree, author });
  repo.branches[branch] = c.id;
  if (!repo.head || repo.head.kind !== "branch") repo.head = { kind: "branch", name: branch };
  return c.id;
}

export function teammateReview(world: World, n: number, state: "approved" | "changes_requested" | "commented", body = "") {
  const pr = findPr(world, n);
  const text = body || (state === "approved" ? "Looks good to me! 🚀" : state === "changes_requested" ? "Could you add a test for this?" : "Nice.");
  pr.reviews.push({ author: world.teammate, state, body: text });
}

export function describePr(world: World, pr: PullRequest): string[] {
  const gh = world.github.repos[pr.repo];
  const head = world.github.repos[pr.headRepo];
  const tip = prHeadTip(world, pr);
  const baseRepo = world.repos[pr.repo];
  const commits = tip ? rangeCommits({ ...world.repos[pr.headRepo], commits: { ...world.repos[pr.headRepo].commits, ...baseRepo.commits } }, tip, [baseRepo.branches[pr.base]]) : [];
  const lines = [
    `${pr.title} #${pr.number}`,
    `${pr.state === "open" ? "Open" : pr.state === "merged" ? "Merged" : "Closed"} • ${pr.author} wants to merge ${plural(commits.length, "commit")} into ${pr.base} from ${head.owner === gh.owner ? "" : head.owner + ":"}${pr.head}`,
  ];
  for (const r of pr.reviews) lines.push(`  ${r.author}: ${r.state.replace("_", " ")} — ${r.body}`);
  if (tip) {
    const run = latestRun(world, tip);
    if (run) lines.push(`  checks: ${run.workflow} ${run.status === "success" ? "✓ passed" : "✗ failed"}`);
  }
  if (pr.state === "open") {
    const m = prMergeability(world, pr);
    lines.push(m.ok ? "  ✓ Ready to merge" : `  ✗ ${m.reasons.join("; ")}`);
  }
  lines.push(`View this pull request on GitHub: ${ghWeb(gh)}/pull/${pr.number}`);
  return lines;
}

export { short, firstLine };
