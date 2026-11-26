import { type Command, type Ctx, requireRepo } from "../context";
import {
  copyObjects,
  createGhRepo,
  describePr,
  findGh,
  findPr,
  ghUrl,
  ghWeb,
  latestRun,
  mergePr,
  prHeadTip,
  prMergeability,
  triggerWorkflows,
} from "../github";
import { checkoutTree, currentBranch, fail, firstLine, headId, isAncestor, setHead } from "../repo";
import { parseArgs } from "../shell";
import type { GhRepo, MergeMethod, PullRequest } from "../types";
import { createBranch } from "./branching";
import { cloneInto, fetchRemote, push } from "./remote";

function originGh(ctx: Ctx): GhRepo | null {
  const url = ctx.repo.remotes.origin;
  return url ? findGh(ctx.world, url) : null;
}

function needOrigin(ctx: Ctx): GhRepo {
  requireRepo(ctx);
  const gh = originGh(ctx);
  if (!gh) fail("none of the git remotes configured for this repository point to a known GitHub host.", "hint: add one with git remote add origin <url> (or gh repo create)");
  return gh!;
}

/** PRs target the parent repo when origin is a fork (gh's default). */
function baseRepoFor(ctx: Ctx, origin: GhRepo): GhRepo {
  return origin.forkOf ? ctx.world.github.repos[origin.forkOf] : origin;
}

function prArg(ctx: Ctx, arg: string | undefined): PullRequest {
  if (arg) return findPr(ctx.world, Number(arg.replace(/^#/, "")));
  const b = currentBranch(ctx.repo);
  const pr = ctx.world.github.prs.find((p) => p.head === b && p.state === "open");
  if (!pr) fail(`no pull requests found for branch "${b}"`);
  return pr!;
}

export const gh: Command = (ctx, argv) => {
  const [area, sub, ...rest] = argv;
  const world = ctx.world;
  if (!area || area === "help" || area === "--help") {
    ctx.out("Work seamlessly with GitHub from the command line.\n\nCORE COMMANDS\n  repo:  fork, create, clone, view\n  pr:    create, list, view, checkout, review, merge, close, checks\n  run:   list, view\n  auth:  status");
    return;
  }
  if (area === "auth") {
    ctx.out(`github.com\n  ✓ Logged in to github.com account ${world.user.login} (simulated)`, "success");
    return;
  }
  if (area === "repo") {
    const a = parseArgs(rest, {
      bool: ["--clone", "--public", "--private", "--push", "-w", "--web"],
      value: ["--source", "--remote-name", "-s"],
      alias: { "-s": "--source" },
      optionalValue: ["--remote"],
    });
    if (sub === "fork") {
      const target = a.pos[0] ? findGh(world, a.pos[0]) : ctx.repo.initialized ? originGh(ctx) : null;
      if (!target) fail(a.pos[0] ? `GraphQL: Could not resolve to a Repository with the name '${a.pos[0]}'.` : "error: no repository specified — try gh repo fork <owner>/<repo>");
      const t = target!;
      if (t.owner === world.user.login) fail(`failed to fork: ${t.owner}/${t.name} is already yours`);
      let fork = Object.values(world.github.repos).find((g) => g.forkOf === t.key && g.owner === world.user.login);
      if (fork) ctx.out(`! ${fork.owner}/${fork.name} already exists`, "warn");
      else {
        const key = world.repos.origin && world.github.repos.origin ? `fork-${t.name}` : "origin";
        fork = createGhRepo(world, key, world.user.login, t.name, { forkOf: t.key });
        const src = world.repos[t.key];
        const dst = world.repos[key];
        copyObjects(src, dst, Object.values(src.branches));
        dst.branches = { ...src.branches };
        dst.tags = { ...src.tags };
        dst.head = { kind: "branch", name: t.defaultBranch };
        fork.defaultBranch = t.defaultBranch;
        ctx.out(`✓ Created fork ${fork.owner}/${fork.name}`, "success");
        ctx.emit({ type: "transfer", from: t.key, to: key, ids: Object.keys(dst.commits) });
      }
      const inClone = ctx.repo.initialized && originGh(ctx)?.key === t.key;
      if (inClone) {
        const repo = ctx.repo;
        repo.remotes.upstream = repo.remotes.origin;
        repo.remoteRefs.upstream = repo.remoteRefs.origin ?? {};
        for (const u of Object.values(repo.upstream)) if (u.remote === "origin") u.remote = "upstream";
        repo.remotes.origin = ghUrl(fork);
        repo.remoteRefs.origin = {};
        ctx.out("✓ Renamed remote origin to upstream", "success");
        ctx.out("✓ Added remote origin", "success");
        fetchRemote(ctx, "origin", { quiet: true });
      } else if (a.has("--clone")) {
        if (ctx.repo.initialized) fail("error: this sandbox already holds a repository — reset it to clone the fork");
        cloneInto(ctx, ghUrl(fork), fork.name);
        ctx.repo.remotes.upstream = ghUrl(t);
        fetchRemote(ctx, "upstream", { quiet: true });
        ctx.out(`✓ Cloned fork\n! Repository ${t.owner}/${t.name} set as the default repository`, "success");
      }
      return;
    }
    if (sub === "create") {
      const name = a.pos[0] ?? ctx.repo.name;
      const [owner, repoName] = name.includes("/") ? name.split("/") : [world.user.login, name];
      if (Object.values(world.github.repos).some((g) => g.owner === owner && g.name === repoName))
        fail(`GraphQL: Name already exists on this account (createRepository)`);
      const key = world.github.repos.origin ? `repo-${repoName}` : "origin";
      const g = createGhRepo(world, key, owner, repoName);
      ctx.out(`✓ Created repository ${owner}/${repoName} on GitHub\n  ${ghWeb(g)}`, "success");
      if (a.value("--source")) {
        requireRepo(ctx);
        const rname = a.value("--remote-name") ?? a.value("--remote") ?? "origin";
        if (ctx.repo.remotes[rname]) fail(`error: remote ${rname} already exists.`);
        ctx.repo.remotes[rname] = ghUrl(g);
        ctx.out(`✓ Added remote ${ghUrl(g)}`, "success");
        if (a.has("--push")) {
          const b = currentBranch(ctx.repo);
          if (!b || !headId(ctx.repo)) fail("error: nothing to push yet — make a commit first");
          push(ctx, ["-u", rname, b!]);
          g.defaultBranch = b!;
          ctx.out(`✓ Pushed commits to ${ghUrl(g)}`, "success");
        }
      }
      return;
    }
    if (sub === "clone") {
      if (!a.pos[0]) fail("cannot clone: repository argument required");
      const g = findGh(world, a.pos[0]);
      if (!g) fail(`GraphQL: Could not resolve to a Repository with the name '${a.pos[0]}'.`);
      if (ctx.repo.initialized) fail("error: this sandbox already holds a repository — reset it to clone");
      cloneInto(ctx, ghUrl(g!), g!.name);
      if (g!.forkOf) {
        ctx.repo.remotes.upstream = ghUrl(world.github.repos[g!.forkOf]);
        fetchRemote(ctx, "upstream", { quiet: true });
      }
      return;
    }
    if (sub === "view") {
      const g = a.pos[0] ? findGh(world, a.pos[0]) : needOrigin(ctx);
      if (!g) fail("GraphQL: Could not resolve to a Repository");
      const r = world.repos[g!.key];
      ctx.out(`${g!.owner}/${g!.name}${g!.forkOf ? `  (fork of ${world.github.repos[g!.forkOf].owner}/${world.github.repos[g!.forkOf].name})` : ""}`);
      ctx.out(`branches: ${Object.keys(r.branches).join(", ") || "(none)"}`);
      ctx.out(`open pull requests: ${world.github.prs.filter((p) => p.repo === g!.key && p.state === "open").length}`);
      ctx.out(`View this repository on GitHub: ${ghWeb(g!)}`, "muted");
      return;
    }
    fail(`unknown command "${sub}" for "gh repo"`);
  }
  if (area === "pr") return prCommand(ctx, sub, rest);
  if (area === "run") {
    const runs = world.github.runs;
    if (sub === "list" || !sub) {
      if (!runs.length) ctx.out("no runs found");
      for (const r of [...runs].reverse().slice(0, 10))
        ctx.out(`${r.status === "success" ? "✓" : "X"}  ${firstLine(world.repos[r.repo].commits[r.sha]?.message ?? "")}  ${r.workflow}  ${r.branch}  ${r.event}  ${r.id}`, r.status === "success" ? "success" : "error");
      return;
    }
    if (sub === "view") {
      const r = runs.find((x) => x.id === Number(rest[0])) ?? runs[runs.length - 1];
      if (!r) fail("no runs found");
      ctx.out(`${r.status === "success" ? "✓" : "X"} ${r.branch} ${r.workflow} · ${r.id}`, r.status === "success" ? "success" : "error");
      for (const s of r.steps) {
        ctx.out(`  ${s.status === "success" ? "✓" : s.status === "failure" ? "X" : "-"} ${s.name}`, s.status === "failure" ? "error" : "normal");
        if (rest.includes("--log") || s.status === "failure") s.log.forEach((l) => ctx.out(`      ${l}`, "muted"));
      }
      return;
    }
    fail(`unknown command "${sub}" for "gh run"`);
  }
  fail(`unknown command "${area}" for "gh"`, "hint: try gh repo, gh pr, gh run");
};

function prCommand(ctx: Ctx, sub: string | undefined, rest: string[]) {
  const world = ctx.world;
  const a = parseArgs(rest, {
    bool: ["--approve", "-a", "--request-changes", "-r", "--comment", "-c", "--merge", "-m", "--squash", "-s", "--rebase", "--delete-branch", "-d", "--fill", "-f", "--admin", "--auto", "--draft", "-w", "--web"],
    value: ["--title", "-t", "--body", "-b", "--base", "-B", "--head", "-H", "--state"],
    alias: { "-a": "--approve", "-r": "--request-changes", "-c": "--comment", "-m": "--merge", "-s": "--squash", "-d": "--delete-branch", "-f": "--fill", "-t": "--title", "-b": "--body", "-B": "--base", "-H": "--head" },
  });
  const origin = needOrigin(ctx);
  const repo = ctx.repo;
  switch (sub) {
    case "create": {
      const base = baseRepoFor(ctx, origin);
      const head = a.value("--head") ?? currentBranch(repo);
      if (!head) fail("could not determine the current branch: not on any branch");
      const headRepo = world.repos[origin.key];
      if (!headRepo.branches[head!])
        fail(`aborted: you must first push the current branch to a remote, or use the --head flag`, `hint: git push -u origin ${head}`);
      const localTip = repo.branches[head!];
      if (localTip && localTip !== headRepo.branches[head!] && !isAncestor(repo, localTip, headRepo.branches[head!]))
        ctx.out(`Warning: your local '${head}' has commits that aren't pushed yet — they won't be in the PR`, "warn");
      const baseBranch = a.value("--base") ?? base.defaultBranch;
      const baseRepo = world.repos[base.key];
      if (!baseRepo.branches[baseBranch]) fail(`could not find base branch '${baseBranch}'`);
      const existing = world.github.prs.find((p) => p.state === "open" && p.repo === base.key && p.headRepo === origin.key && p.head === head);
      if (existing) fail(`a pull request for branch "${head}" into branch "${existing.base}" already exists:`, `${ghWeb(base)}/pull/${existing.number}`);
      const tip = headRepo.branches[head!];
      const scratch = { ...baseRepo, commits: { ...baseRepo.commits, ...headRepo.commits } };
      if (isAncestor(scratch, tip, baseRepo.branches[baseBranch])) fail(`pull request create failed: GraphQL: No commits between ${baseBranch} and ${head} (createPullRequest)`);
      let title = a.value("--title");
      let body = a.value("--body") ?? "";
      if (a.has("--fill") && !title) {
        const msg = headRepo.commits[tip].message;
        title = firstLine(msg);
        body = body || msg.split("\n").slice(2).join("\n");
      }
      if (!title) fail("must provide `--title` and `--body` (or `--fill`) when not running interactively");
      const pr: PullRequest = {
        number: world.github.prs.length + 1,
        repo: base.key,
        base: baseBranch,
        headRepo: origin.key,
        head: head!,
        title: title!,
        body,
        author: world.user.login,
        state: "open",
        reviews: [],
        mergedAs: null,
        method: null,
      };
      world.github.prs.push(pr);
      ctx.out(`\nCreating pull request for ${origin.owner === base.owner ? "" : origin.owner + ":"}${head} into ${baseBranch} in ${base.owner}/${base.name}\n`, "muted");
      ctx.out(`${ghWeb(base)}/pull/${pr.number}`, "success");
      ctx.emit({ type: "pr", number: pr.number, action: "opened" });
      triggerWorkflows(ctx, world, origin.key, head!, tip, "pull_request");
      return;
    }
    case "list": {
      const state = a.value("--state") ?? "open";
      const prs = world.github.prs.filter((p) => state === "all" || p.state === state);
      if (!prs.length) {
        ctx.out(`no ${state === "all" ? "" : state + " "}pull requests`);
        return;
      }
      for (const p of prs) ctx.out(`#${p.number}  ${p.title}  ${p.head}  ${p.state.toUpperCase()}`, p.state === "open" ? "success" : "muted");
      return;
    }
    case "view":
    case "status": {
      const pr = prArg(ctx, a.pos[0]);
      describePr(world, pr).forEach((l, i) => ctx.out(l, i === 0 ? "warn" : l.includes("✗") ? "error" : l.includes("✓") ? "success" : "normal"));
      return;
    }
    case "checks": {
      const pr = prArg(ctx, a.pos[0]);
      const tip = prHeadTip(world, pr);
      const run = tip ? latestRun(world, tip) : null;
      if (!run) {
        ctx.out("no checks reported on the '" + pr.head + "' branch");
        return 1;
      }
      ctx.out(`${run.status === "success" ? "✓" : "X"}  ${run.workflow}`, run.status === "success" ? "success" : "error");
      return run.status === "success" ? 0 : 1;
    }
    case "review": {
      const pr = prArg(ctx, a.pos[0]);
      const state = a.has("--approve") ? "approved" : a.has("--request-changes") ? "changes_requested" : a.has("--comment") ? "commented" : null;
      if (!state) fail("did not specify a review action: --approve, --request-changes, or --comment");
      if (pr.author === world.user.login && state !== "commented")
        fail(
          `failed to create review: GraphQL: Review Can not ${state === "approved" ? "approve" : "request changes on"} your own pull request (addPullRequestReview)`,
          "hint: on GitHub someone else has to review your PR — ask your teammate from the GitHub panel",
        );
      pr.reviews.push({ author: world.user.login, state: state!, body: a.value("--body") ?? "" });
      ctx.out(`✓ ${state === "approved" ? "Approved" : state === "changes_requested" ? "Requested changes to" : "Reviewed"} pull request #${pr.number}`, "success");
      ctx.emit({ type: "pr", number: pr.number, action: "reviewed" });
      return;
    }
    case "merge": {
      const pr = prArg(ctx, a.pos[0]);
      if (pr.state !== "open") fail(`X Pull request #${pr.number} (${pr.title}) can't be merged because it is ${pr.state}`);
      const method: MergeMethod | null = a.has("--merge") ? "merge" : a.has("--squash") ? "squash" : a.has("--rebase") ? "rebase" : null;
      if (!method) fail("--merge, --rebase, or --squash required when not running interactively");
      const m = prMergeability(world, pr);
      if (m.conflicts.length)
        fail(`X Pull request #${pr.number} is not mergeable: the merge commit cannot be cleanly created.`, `hint: merge ${pr.base} into your branch locally, fix the conflicts, and push`);
      if (!m.ok && !a.has("--admin"))
        fail(
          `X Pull request #${pr.number} is not mergeable: the base branch policy prohibits the merge.`,
          ...m.reasons.map((r) => `  • ${r}`),
          "To use administrator privileges to immediately merge the pull request, add the `--admin` flag.",
        );
      mergePr(world, pr, method!, world.user.login);
      const verb = method === "merge" ? "Merged" : method === "squash" ? "Squashed and merged" : "Rebased and merged";
      ctx.out(`✓ ${verb} pull request #${pr.number} (${pr.title})`, "success");
      ctx.emit({ type: "pr", number: pr.number, action: "merged" });
      ctx.emit({ type: "ref", repo: pr.repo, ref: pr.base, from: null, to: pr.mergedAs });
      triggerWorkflows(ctx, world, pr.repo, pr.base, pr.mergedAs!, "push");
      if (a.has("--delete-branch")) {
        const headRepo = world.repos[pr.headRepo];
        delete headRepo.branches[pr.head];
        ctx.emit({ type: "ref", repo: pr.headRepo, ref: pr.head, from: null, to: null });
        if (repo.branches[pr.head]) {
          if (currentBranch(repo) === pr.head) {
            const target = repo.branches[pr.base] ? pr.base : null;
            if (target) {
              checkoutTree(repo, repo.commits[repo.branches[target]].tree);
              setHead(repo, { kind: "branch", name: target }, `checkout: moving from ${pr.head} to ${target}`);
            }
          }
          if (currentBranch(repo) !== pr.head) {
            delete repo.branches[pr.head];
            delete repo.upstream[pr.head];
            ctx.out(`✓ Deleted local branch ${pr.head} and switched to branch ${currentBranch(repo)}`, "success");
          }
          ctx.emit({ type: "head", repo: ctx.key });
          ctx.emit({ type: "files", repo: ctx.key });
        }
        ctx.out(`✓ Deleted remote branch ${pr.head}`, "success");
        ctx.out(`hint: your local ${pr.base} doesn't have the merge yet — run git pull`, "hint");
      }
      return;
    }
    case "close": {
      const pr = prArg(ctx, a.pos[0]);
      pr.state = "closed";
      ctx.out(`✓ Closed pull request #${pr.number} (${pr.title})`, "success");
      ctx.emit({ type: "pr", number: pr.number, action: "closed" });
      return;
    }
    case "checkout": {
      const pr = prArg(ctx, a.pos[0]);
      const headRepo = world.repos[pr.headRepo];
      const tip = headRepo.branches[pr.head];
      if (!tip) fail(`the head branch of #${pr.number} was deleted`);
      copyObjects(headRepo, repo, [tip]);
      if (repo.branches[pr.head] && repo.branches[pr.head] !== tip && !isAncestor(repo, repo.branches[pr.head], tip))
        fail(`branch '${pr.head}' already exists and has diverged — switch to it and pull instead`);
      if (!repo.branches[pr.head]) createBranch(ctx, pr.head, tip);
      else repo.branches[pr.head] = tip;
      const remoteName = Object.keys(repo.remotes).find((r) => findGh(world, repo.remotes[r])?.key === pr.headRepo);
      if (remoteName) {
        (repo.remoteRefs[remoteName] ??= {})[pr.head] = tip;
        repo.upstream[pr.head] = { remote: remoteName, branch: pr.head };
      }
      checkoutTree(repo, repo.commits[tip].tree);
      setHead(repo, { kind: "branch", name: pr.head }, `checkout: moving to ${pr.head}`);
      ctx.out(`Switched to branch '${pr.head}'`);
      ctx.emit({ type: "head", repo: ctx.key });
      ctx.emit({ type: "files", repo: ctx.key });
      return;
    }
    default:
      fail(`unknown command "${sub ?? ""}" for "gh pr"`, "hint: create, list, view, checkout, review, merge, close, checks");
  }
}
