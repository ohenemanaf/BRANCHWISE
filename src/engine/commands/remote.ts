import { type Command, type Ctx, requireRepo } from "../context";
import { copyObjects, findGh, ghUrl, ghWeb, triggerWorkflows } from "../github";
import { short } from "../hash";
import { currentBranch, emptyRepo, fail, headId, isAncestor, resolveRev, tryResolve } from "../repo";
import { parseArgs } from "../shell";
import type { GhRepo, Id, Repo } from "../types";
import { doMerge, rebasePlan, startRebase } from "./history";

function remoteGh(ctx: Ctx, remote: string): GhRepo {
  const url = ctx.repo.remotes[remote];
  if (!url)
    fail(
      `fatal: '${remote}' does not appear to be a git repository`,
      "fatal: Could not read from remote repository.",
      "",
      "Please make sure you have the correct access rights",
      "and the repository exists.",
    );
  const gh = findGh(ctx.world, url);
  if (!gh) fail("remote: Repository not found.", `fatal: repository '${url}' not found`);
  return gh!;
}

// ---------- remote ----------

export const remote: Command = (ctx, argv) => {
  requireRepo(ctx);
  const repo = ctx.repo;
  const [sub, ...rest] = argv;
  if (!sub || sub === "-v" || sub === "--verbose") {
    for (const [name, url] of Object.entries(repo.remotes)) {
      if (sub) {
        ctx.out(`${name}\t${url} (fetch)`);
        ctx.out(`${name}\t${url} (push)`);
      } else ctx.out(name);
    }
    return;
  }
  const [a, b] = rest;
  switch (sub) {
    case "add":
      if (!a || !b) fail("usage: git remote add <name> <url>");
      if (repo.remotes[a]) fail(`error: remote ${a} already exists.`);
      repo.remotes[a] = b;
      return;
    case "remove":
    case "rm":
      if (!repo.remotes[a]) fail(`error: No such remote: '${a}'`);
      delete repo.remotes[a];
      delete repo.remoteRefs[a];
      for (const [br, u] of Object.entries(repo.upstream)) if (u.remote === a) delete repo.upstream[br];
      ctx.emit({ type: "ref", repo: ctx.key, ref: `${a}/*`, from: null, to: null });
      return;
    case "rename":
      if (!repo.remotes[a]) fail(`error: No such remote: '${a}'`);
      if (repo.remotes[b]) fail(`error: remote ${b} already exists.`);
      repo.remotes[b] = repo.remotes[a];
      delete repo.remotes[a];
      if (repo.remoteRefs[a]) {
        repo.remoteRefs[b] = repo.remoteRefs[a];
        delete repo.remoteRefs[a];
      }
      for (const u of Object.values(repo.upstream)) if (u.remote === a) u.remote = b;
      ctx.emit({ type: "ref", repo: ctx.key, ref: `${b}/*`, from: null, to: null });
      return;
    case "set-url":
      if (!repo.remotes[a]) fail(`error: No such remote '${a}'`);
      repo.remotes[a] = b;
      return;
    case "get-url":
      if (!repo.remotes[a]) fail(`error: No such remote '${a}'`);
      ctx.out(repo.remotes[a]);
      return;
    case "show":
      if (!repo.remotes[a]) fail(`error: No such remote '${a}'`);
      ctx.out(`* remote ${a}\n  Fetch URL: ${repo.remotes[a]}\n  Push  URL: ${repo.remotes[a]}`);
      for (const br of Object.keys(repo.remoteRefs[a] ?? {})) ctx.out(`    ${br} tracked`);
      return;
    case "prune":
      return fetchRemote(ctx, a ?? "origin", { prune: true, quiet: false, pruneOnly: true });
    default:
      fail(`error: unknown subcommand: \`${sub}'`, "usage: git remote [-v] | add | remove | rename | set-url | get-url | show | prune");
  }
};

// ---------- fetch ----------

export function fetchRemote(
  ctx: Ctx,
  remoteName: string,
  o: { prune?: boolean; quiet?: boolean; only?: string; pruneOnly?: boolean } = {},
): number | void {
  const repo = ctx.repo;
  const gh = remoteGh(ctx, remoteName);
  const src = ctx.world.repos[gh.key];
  const refs = (repo.remoteRefs[remoteName] ??= {});
  const lines: string[] = [];
  const branches = o.only ? (src.branches[o.only] ? [o.only] : []) : Object.keys(src.branches).sort();
  if (o.only && !branches.length) fail(`fatal: couldn't find remote ref ${o.only}`);
  if (!o.pruneOnly) {
    const copied = copyObjects(src, repo, branches.map((b) => src.branches[b]));
    if (copied.length) ctx.emit({ type: "transfer", from: gh.key, to: ctx.key, ids: copied });
    for (const b of branches) {
      const old = refs[b];
      const nu = src.branches[b];
      if (old === nu) continue;
      const pad = (s: string) => s.padEnd(17);
      if (!old) lines.push(` * ${pad("[new branch]")} ${b.padEnd(10)} -> ${remoteName}/${b}`);
      else if (isAncestor(repo, old, nu)) lines.push(`   ${pad(`${short(old)}..${short(nu)}`)} ${b.padEnd(10)} -> ${remoteName}/${b}`);
      else lines.push(` + ${pad(`${short(old)}...${short(nu)}`)} ${b.padEnd(10)} -> ${remoteName}/${b}  (forced update)`);
      refs[b] = nu;
      ctx.emit({ type: "ref", repo: ctx.key, ref: `${remoteName}/${b}`, from: old ?? null, to: nu });
    }
    for (const [t, id] of Object.entries(src.tags)) {
      if (repo.tags[t] || !repo.commits[id]) continue;
      repo.tags[t] = id;
      lines.push(` * ${"[new tag]".padEnd(17)} ${t.padEnd(10)} -> ${t}`);
    }
  }
  if ((o.prune || repo.config["fetch.prune"] === "true") && !o.only) {
    for (const b of Object.keys(refs)) {
      if (src.branches[b]) continue;
      lines.push(` - ${"[deleted]".padEnd(17)} ${"(none)".padEnd(10)} -> ${remoteName}/${b}`);
      ctx.emit({ type: "ref", repo: ctx.key, ref: `${remoteName}/${b}`, from: refs[b], to: null });
      delete refs[b];
    }
  }
  if (lines.length && !o.quiet) {
    ctx.out(`From ${ghWeb(gh)}`);
    lines.forEach((l) => ctx.out(l));
  }
}

export const fetch: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--all", "--prune", "-p", "-q", "--tags", "-v"], alias: { "-p": "--prune" } });
  const repo = ctx.repo;
  const remotes = a.has("--all") ? Object.keys(repo.remotes) : [a.pos[0] ?? defaultRemote(repo)];
  if (!remotes.length || !remotes[0]) fail("fatal: No remote repository specified.  Please, specify either a URL or a", "remote name from which new revisions should be fetched.");
  for (const r of remotes) {
    if (a.has("--all")) ctx.out(`Fetching ${r}`, "muted");
    fetchRemote(ctx, r, { prune: a.has("--prune"), only: a.has("--all") ? undefined : a.pos[1] });
  }
};

function defaultRemote(repo: Repo): string {
  const b = currentBranch(repo);
  if (b && repo.upstream[b]) return repo.upstream[b].remote;
  return repo.remotes.origin ? "origin" : Object.keys(repo.remotes)[0];
}

// ---------- pull ----------

export const pull: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--rebase", "-r", "--no-rebase", "--ff-only", "--ff", "--no-ff", "-q", "--no-edit"], alias: { "-r": "--rebase" } });
  const repo = ctx.repo;
  const b = currentBranch(repo);
  let remoteName = a.pos[0];
  let branchName = a.pos[1];
  if (!remoteName) {
    const up = b ? repo.upstream[b] : undefined;
    if (!up) {
      if (!b) fail("You are not currently on a branch.", "Please specify which branch you want to merge with.", "", "    git pull <remote> <branch>");
      fail(
        "There is no tracking information for the current branch.",
        "Please specify which branch you want to merge with.",
        "",
        "    git pull <remote> <branch>",
        "",
        "If you wish to set tracking information for this branch you can do so with:",
        "",
        `    git branch --set-upstream-to=origin/<branch> ${b}`,
      );
    }
    remoteName = up!.remote;
    branchName = up!.branch;
  }
  if (!branchName) {
    const up = b ? repo.upstream[b] : undefined;
    if (up && up.remote === remoteName) branchName = up.branch;
    else fail("You asked to pull from the remote '" + remoteName + "', but did not specify", "a branch. Because this is not the default configured remote", "for your current branch, you must specify a branch on the command line.");
  }
  fetchRemote(ctx, remoteName, { only: branchName });
  const theirs = repo.remoteRefs[remoteName]?.[branchName];
  if (!theirs) fail(`fatal: couldn't find remote ref ${branchName}`);
  const head = headId(repo);
  const ref = `${remoteName}/${branchName}`;
  if (head && isAncestor(repo, theirs, head)) {
    ctx.out("Already up to date.");
    return;
  }
  const canFF = !head || isAncestor(repo, head, theirs);
  const cfg = repo.config["pull.rebase"];
  const mode = a.has("--rebase")
    ? "rebase"
    : a.has("--no-rebase")
      ? "merge"
      : a.has("--ff-only") || repo.config["pull.ff"] === "only"
        ? "ff-only"
        : cfg === "true"
          ? "rebase"
          : cfg === "false"
            ? "merge"
            : null;
  if (canFF && mode !== "rebase") return doMerge(ctx, ref, { label: ref });
  if (mode === "ff-only") {
    ctx.out("fatal: Not possible to fast-forward, aborting.", "error");
    return 1;
  }
  if (!mode) {
    [
      "hint: You have divergent branches and need to specify how to reconcile them.",
      "hint: You can do so by running one of the following commands sometime before",
      "hint: your next pull:",
      "hint:",
      "hint:   git config pull.rebase false  # merge",
      "hint:   git config pull.rebase true   # rebase",
      "hint:   git config pull.ff only       # fast-forward only",
      "hint:",
      'hint: You can replace "git config" with "git config --global" to set a default',
      "hint: preference for all repositories. You can also pass --rebase, --no-rebase,",
      "hint: or --ff-only on the command line to override the configured default per",
      "hint: invocation.",
    ].forEach((l) => ctx.out(l, "hint"));
    ctx.out("fatal: Need to specify how to reconcile divergent branches.", "error");
    return 1;
  }
  const gh = remoteGh(ctx, remoteName);
  if (mode === "merge") return doMerge(ctx, ref, { label: ref, message: `Merge branch '${branchName}' of ${ghWeb(gh)}${b && b !== "main" && b !== "master" ? ` into ${b}` : ""}` });
  const { steps } = rebasePlan(repo, theirs, head!);
  if (!steps.length) return doMerge(ctx, ref, { label: ref });
  return startRebase(ctx, theirs, steps, ref);
};

// ---------- push ----------

const pad = (s: string) => s.padEnd(17);

export const push: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, {
    bool: ["-u", "--set-upstream", "-f", "--force", "-d", "--delete", "--tags", "--all", "-q", "-v", "--dry-run", "-n", "--no-verify"],
    optionalValue: ["--force-with-lease"],
    alias: { "--set-upstream": "-u", "--force": "-f", "--delete": "-d", "-n": "--dry-run" },
  });
  const repo = ctx.repo;
  const b = currentBranch(repo);
  const remoteName = a.pos[0] ?? defaultRemote(repo);
  if (!remoteName) fail("fatal: No configured push destination.", "Either specify the URL from the command-line or configure a remote repository using", "", "    git remote add <name> <url>", "", "and then push using the remote name", "", "    git push <name>");
  const gh = remoteGh(ctx, remoteName);
  const dst = ctx.world.repos[gh.key];
  const url = ghUrl(gh);

  type Spec = { src: string | null; dst: string };
  let specs: Spec[] = a.pos.slice(1).map((s) => {
    if (s.includes(":")) {
      const [x, y] = s.split(":");
      return { src: x || null, dst: y };
    }
    return { src: s, dst: s === "HEAD" ? (b ?? s) : s };
  });
  if (a.has("-d")) specs = a.pos.slice(1).map((s) => ({ src: null, dst: s }));
  if (a.has("--all")) specs = Object.keys(repo.branches).map((x) => ({ src: x, dst: x }));
  if (!specs.length && !a.has("--tags")) {
    if (!b) fail("fatal: You are not currently on a branch.", "To push the history leading to the current (detached HEAD)", "state now, use", "", "    git push origin HEAD:<name-of-remote-branch>");
    const up = repo.upstream[b!];
    if (!up && !a.has("-u")) {
      fail(
        `fatal: The current branch ${b} has no upstream branch.`,
        "To push the current branch and set the remote as upstream, use",
        "",
        `    git push --set-upstream ${remoteName} ${b}`,
        "",
        "hint: -u is the short form of --set-upstream",
      );
    }
    specs = [{ src: b!, dst: up && up.remote === remoteName ? up.branch : b! }];
  }
  const lease = a.flags["--force-with-lease"];
  const force = a.has("-f");
  const out: string[] = [];
  const rejected: string[] = [];
  let hint: "fetch" | "behind" | "stale" | null = null;
  const created: string[] = [];
  const pushedTips: { branch: string; sha: Id }[] = [];

  for (const s of specs) {
    const protection = gh.protection[s.dst];
    if (s.src === null) {
      if (!dst.branches[s.dst]) {
        out.push(` ! ${pad("[remote rejected]")} ${s.dst} (remote ref does not exist)`);
        rejected.push(s.dst);
        continue;
      }
      if (protection || s.dst === gh.defaultBranch) {
        out.push(` ! ${pad("[remote rejected]")} ${s.dst} (refusing to delete the ${protection ? "protected" : "default"} branch)`);
        rejected.push(s.dst);
        continue;
      }
      if (!a.has("--dry-run")) {
        delete dst.branches[s.dst];
        if (repo.remoteRefs[remoteName]) delete repo.remoteRefs[remoteName][s.dst];
        ctx.emit({ type: "ref", repo: gh.key, ref: s.dst, from: null, to: null });
        ctx.emit({ type: "ref", repo: ctx.key, ref: `${remoteName}/${s.dst}`, from: null, to: null });
      }
      out.push(` - ${pad("[deleted]")} ${s.dst}`);
      continue;
    }
    const srcId = tryResolve(repo, s.src);
    if (!srcId) {
      fail(`error: src refspec ${s.src} does not match any`, `error: failed to push some refs to '${url}'`);
    }
    const tip = dst.branches[s.dst];
    const label = `${s.src === "HEAD" ? (b ?? "HEAD") : s.src} -> ${s.dst}`;
    if (tip === srcId) {
      out.push(`   ${pad("[up to date]")} ${label}`);
      continue;
    }
    if (protection?.requirePullRequest) {
      out.push(
        "remote: error: GH006: Protected branch update failed for refs/heads/" + s.dst + ".",
        "remote: error: Changes must be made through a pull request.",
      );
      out.push(` ! ${pad("[remote rejected]")} ${label} (protected branch hook declined)`);
      rejected.push(s.dst);
      continue;
    }
    let forced = false;
    if (tip) {
      const known = !!repo.commits[tip];
      const ff = known && isAncestor(repo, tip, srcId!);
      if (!ff) {
        if (lease !== undefined) {
          const expected = Array.isArray(lease) ? resolveRev(repo, lease[0]) : repo.remoteRefs[remoteName]?.[s.dst];
          if (expected !== tip) {
            out.push(` ! ${pad("[rejected]")} ${label} (stale info)`);
            rejected.push(s.dst);
            hint = "stale";
            continue;
          }
          forced = true;
        } else if (force) forced = true;
        else {
          out.push(` ! ${pad("[rejected]")} ${label} (${known ? "non-fast-forward" : "fetch first"})`);
          rejected.push(s.dst);
          hint = known ? "behind" : "fetch";
          continue;
        }
      }
    }
    if (a.has("--dry-run")) {
      out.push(`   ${pad(tip ? `${short(tip)}..${short(srcId!)}` : "[new branch]")} ${label}`);
      continue;
    }
    const copied = copyObjects(repo, dst, [srcId!]);
    if (copied.length) ctx.emit({ type: "transfer", from: ctx.key, to: gh.key, ids: copied });
    dst.branches[s.dst] = srcId!;
    (repo.remoteRefs[remoteName] ??= {})[s.dst] = srcId!;
    ctx.emit({ type: "ref", repo: gh.key, ref: s.dst, from: tip ?? null, to: srcId! });
    ctx.emit({ type: "ref", repo: ctx.key, ref: `${remoteName}/${s.dst}`, from: tip ?? null, to: srcId! });
    if (!tip) {
      out.push(` * ${pad("[new branch]")} ${label}`);
      created.push(s.dst);
    } else if (forced) out.push(` + ${pad(`${short(tip)}...${short(srcId!)}`)} ${label} (forced update)`);
    else out.push(`   ${pad(`${short(tip)}..${short(srcId!)}`)} ${label}`);
    pushedTips.push({ branch: s.dst, sha: srcId! });
    if (a.has("-u") && s.src && repo.branches[s.src]) {
      repo.upstream[s.src] = { remote: remoteName, branch: s.dst };
    }
  }
  if (a.has("--tags")) {
    for (const [t, id] of Object.entries(repo.tags)) {
      if (dst.tags[t] === id) continue;
      copyObjects(repo, dst, [id]);
      dst.tags[t] = id;
      out.push(` * ${pad("[new tag]")} ${t} -> ${t}`);
    }
  }
  const okLines = out.filter((l) => !l.startsWith(" !") && !l.startsWith("remote:"));
  if (!okLines.length && !rejected.length) {
    ctx.out("Everything up-to-date");
    return;
  }
  if (out.every((l) => l.includes("[up to date]"))) {
    ctx.out("Everything up-to-date");
    return;
  }
  for (const c of created) {
    if (c === gh.defaultBranch) continue;
    ["remote: ", `remote: Create a pull request for '${c}' on GitHub by visiting:`, `remote:      ${ghWeb(gh)}/pull/new/${c}`, "remote: "].forEach((l) =>
      ctx.out(l, "muted"),
    );
  }
  out.filter((l) => l.startsWith("remote:")).forEach((l) => ctx.out(l, "error"));
  ctx.out(`To ${url}`);
  out.filter((l) => !l.startsWith("remote:")).forEach((l) => ctx.out(l, l.startsWith(" !") ? "error" : "normal"));
  if (a.has("-u")) for (const s of specs) if (s.src && repo.upstream[s.src]) ctx.out(`branch '${s.src}' set up to track '${remoteName}/${s.dst}'.`);
  if (rejected.length) {
    ctx.out(`error: failed to push some refs to '${url}'`, "error");
    const hints =
      hint === "fetch"
        ? [
            "Updates were rejected because the remote contains work that you do not",
            "have locally. This is usually caused by another repository pushing to",
            "the same ref. If you want to integrate the remote changes, use",
            "'git pull' before pushing again.",
          ]
        : hint === "behind"
          ? [
              "Updates were rejected because the tip of your current branch is behind",
              "its remote counterpart. If you want to integrate the remote changes,",
              "use 'git pull' before pushing again.",
            ]
          : hint === "stale"
            ? ["The remote branch moved since you last fetched. --force-with-lease refused to", "overwrite work you haven't seen. Fetch, look at it, then decide."]
            : [];
    hints.forEach((h) => ctx.out(`hint: ${h}`, "hint"));
  }
  for (const t of pushedTips) {
    triggerWorkflows(ctx, ctx.world, gh.key, t.branch, t.sha, "push");
    for (const pr of ctx.world.github.prs)
      if (pr.state === "open" && pr.headRepo === gh.key && pr.head === t.branch) triggerWorkflows(ctx, ctx.world, gh.key, t.branch, t.sha, "pull_request");
  }
  return rejected.length ? 1 : 0;
};

// ---------- clone ----------

export function cloneInto(ctx: Ctx, url: string, dir?: string) {
  const world = ctx.world;
  const gh = findGh(world, url);
  if (!gh) fail(`Cloning into '${dir ?? url.split("/").pop()?.replace(/\.git$/, "")}'...`, "remote: Repository not found.", `fatal: repository '${url}' not found`);
  const src = world.repos[gh!.key];
  const repo = emptyRepo(dir ?? gh!.name);
  repo.remotes.origin = ghUrl(gh!);
  copyObjects(src, repo, [...Object.values(src.branches), ...Object.values(src.tags)]);
  repo.remoteRefs.origin = { ...src.branches };
  repo.tags = { ...src.tags };
  const def = src.branches[gh!.defaultBranch] ? gh!.defaultBranch : Object.keys(src.branches)[0];
  ctx.out(`Cloning into '${dir ?? gh!.name}'...`);
  const n = Object.keys(repo.commits).length;
  if (def) {
    const id = src.branches[def];
    repo.branches[def] = id;
    repo.upstream[def] = { remote: "origin", branch: def };
    repo.head = { kind: "branch", name: def };
    repo.index = { ...repo.commits[id].tree };
    repo.workdir = { ...repo.commits[id].tree };
    repo.reflog = { HEAD: [{ id, prev: null, message: `clone: from ${ghUrl(gh!)}` }], [def]: [{ id, prev: null, message: `clone: from ${ghUrl(gh!)}` }] };
    ctx.out(`remote: Enumerating objects: ${n * 3}, done.\nReceiving objects: 100% (${n * 3}/${n * 3}), done.`, "muted");
  } else ctx.out("warning: You appear to have cloned an empty repository.", "warn");
  world.repos[world.cwd] = repo;
  ctx.emit({ type: "head", repo: world.cwd });
  ctx.emit({ type: "files", repo: world.cwd });
}

export const clone: Command = (ctx, argv) => {
  const a = parseArgs(argv, { bool: ["-q", "--bare"], value: ["-b", "--branch", "--depth"] });
  const url = a.pos[0];
  if (!url) fail("fatal: You must specify a repository to clone.");
  if (ctx.repo.initialized) fail(`fatal: destination path '${a.pos[1] ?? ctx.repo.name}' already exists and is not an empty directory.`, "hint: this sandbox holds one project — reset it from the toolbar to clone fresh");
  cloneInto(ctx, url, a.pos[1]);
};

export { requireRepo };
