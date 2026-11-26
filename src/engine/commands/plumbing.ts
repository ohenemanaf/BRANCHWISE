import { type Command, type Ctx, PROJECT_PATH, requireCommit, requireRepo } from "../context";
import { findGh, ghUrl } from "../github";
import { hashString, short, stableTree } from "../hash";
import { currentBranch, fail, headId, resolveRev } from "../repo";
import { parseArgs } from "../shell";
import type { Tree } from "../types";

/** Peek at Git's own files: the point of the internals lesson is that refs are tiny text files. */
export function gitFile(ctx: Ctx, path: string): string | null {
  const repo = ctx.repo;
  if (!repo.initialized) return null;
  const p = path.replace(/^\.\//, "").replace(/^\.git\//, "");
  if (p === "HEAD") return repo.head.kind === "branch" ? `ref: refs/heads/${repo.head.name}` : repo.head.id;
  if (p === "ORIG_HEAD") return repo.origHead;
  if (p === "MERGE_HEAD") return repo.op?.kind === "merge" ? repo.op.theirs : null;
  let m = /^refs\/heads\/(.+)$/.exec(p);
  if (m) return repo.branches[m[1]] ?? null;
  m = /^refs\/tags\/(.+)$/.exec(p);
  if (m) return repo.tags[m[1]] ?? null;
  m = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(p);
  if (m) return repo.remoteRefs[m[1]]?.[m[2]] ?? null;
  if (p === "config") {
    const lines = ["[core]", "\tbare = false"];
    for (const [r, u] of Object.entries(repo.remotes)) lines.push(`[remote "${r}"]`, `\turl = ${u}`, `\tfetch = +refs/heads/*:refs/remotes/${r}/*`);
    for (const [b, u] of Object.entries(repo.upstream)) lines.push(`[branch "${b}"]`, `\tremote = ${u.remote}`, `\tmerge = refs/heads/${u.branch}`);
    return lines.join("\n");
  }
  return null;
}

export function listGitDir(ctx: Ctx, dir: string): string[] | null {
  const repo = ctx.repo;
  const d = dir.replace(/^\.\//, "").replace(/\/$/, "");
  if (d === ".git") return ["HEAD", "config", "objects/", "refs/", ...(repo.origHead ? ["ORIG_HEAD"] : [])];
  if (d === ".git/refs") return ["heads/", "remotes/", "tags/"];
  if (d === ".git/refs/heads") return Object.keys(repo.branches).sort();
  if (d === ".git/refs/tags") return Object.keys(repo.tags).sort();
  if (d === ".git/refs/remotes") return Object.keys(repo.remoteRefs).map((r) => r + "/");
  const m = /^\.git\/refs\/remotes\/([^/]+)$/.exec(d);
  if (m) return Object.keys(repo.remoteRefs[m[1]] ?? {}).sort();
  if (d === ".git/objects") return [`(${Object.keys(repo.commits).length} commits, plus their trees and file blobs)`];
  return null;
}

export const treeId = (t: Tree) => hashString("tree" + JSON.stringify(stableTree(t)));
export const blobId = (s: string) => hashString("blob" + s);

export const catFile: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["-p", "-t", "-s", "-e"] });
  const rev = a.pos[0];
  if (!rev) fail("usage: git cat-file (-t | -s | -e | -p) <object>");
  const repo = ctx.repo;
  // tree / blob ids from a previous -p
  for (const c of Object.values(repo.commits)) {
    if (treeId(c.tree) === rev || treeId(c.tree).startsWith(rev)) {
      if (a.has("-t")) return void ctx.out("tree");
      for (const [p, content] of Object.entries(c.tree).sort()) ctx.out(`100644 blob ${blobId(content)}\t${p}`);
      return;
    }
    for (const content of Object.values(c.tree)) {
      const b = blobId(content);
      if (b === rev || (rev.length >= 7 && b.startsWith(rev))) {
        if (a.has("-t")) return void ctx.out("blob");
        ctx.out(content.replace(/\n$/, ""));
        return;
      }
    }
  }
  const id = resolveRev(repo, rev);
  const c = repo.commits[id];
  if (a.has("-t")) return void ctx.out("commit");
  if (a.has("-e")) return;
  ctx.out(`tree ${treeId(c.tree)}`);
  for (const p of c.parents) ctx.out(`parent ${p}`);
  ctx.out(`author ${c.author} <${c.author.toLowerCase().replace(/\s+/g, "")}@example.com> ${1767225600 + c.time * 60} +0000`);
  ctx.out(`committer ${c.author} <${c.author.toLowerCase().replace(/\s+/g, "")}@example.com> ${1767225600 + c.time * 60} +0000`);
  ctx.out("");
  ctx.out(c.message);
};

export const revParse: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["--abbrev-ref", "--short", "--show-toplevel", "--git-dir", "--is-inside-work-tree"] });
  if (a.has("--show-toplevel")) return void ctx.out(PROJECT_PATH);
  if (a.has("--git-dir")) return void ctx.out(".git");
  if (a.has("--is-inside-work-tree")) return void ctx.out("true");
  for (const r of a.pos) {
    if (a.has("--abbrev-ref")) {
      if (r === "HEAD") ctx.out(currentBranch(ctx.repo) ?? "HEAD");
      else ctx.out(r.replace(/^refs\/(heads|remotes)\//, ""));
      continue;
    }
    const id = resolveRev(ctx.repo, r);
    ctx.out(a.has("--short") ? short(id) : id);
  }
};

export const lsFiles: Command = (ctx, argv) => {
  requireRepo(ctx);
  const a = parseArgs(argv, { bool: ["-s", "--stage", "-u", "--unmerged", "-o", "--others"] });
  const repo = ctx.repo;
  if (a.has("-o")) {
    Object.keys(repo.workdir).filter((p) => !(p in repo.index)).sort().forEach((p) => ctx.out(p));
    return;
  }
  for (const p of Object.keys(repo.index).sort()) ctx.out(a.has("-s") ? `100644 ${blobId(repo.index[p])} 0\t${p}` : p);
};

// ---------- submodules (walkthrough-level: a pinned commit id inside the parent) ----------

const SUB_PREFIX = "Subproject commit ";

function parseGitmodules(text: string | undefined): { path: string; url: string }[] {
  const out: { path: string; url: string }[] = [];
  if (!text) return out;
  let cur: { path?: string; url?: string } = {};
  for (const l of text.split("\n")) {
    if (/^\[submodule/.test(l)) {
      if (cur.path && cur.url) out.push(cur as { path: string; url: string });
      cur = {};
    }
    const m = /^\s*(path|url)\s*=\s*(.+)$/.exec(l);
    if (m) cur[m[1] as "path" | "url"] = m[2].trim();
  }
  if (cur.path && cur.url) out.push(cur as { path: string; url: string });
  return out;
}

export const submodule: Command = (ctx, argv) => {
  requireRepo(ctx);
  const [sub, ...rest] = argv;
  const repo = ctx.repo;
  const mods = parseGitmodules(repo.workdir[".gitmodules"]);
  switch (sub) {
    case "add": {
      const [url, pathArg] = rest.filter((x) => !x.startsWith("-"));
      if (!url) fail("usage: git submodule add <repository> [<path>]");
      const gh = findGh(ctx.world, url);
      if (!gh) fail(`Cloning into '${PROJECT_PATH}/${pathArg ?? url.split("/").pop()}'...`, "remote: Repository not found.", `fatal: clone of '${url}' into submodule path failed`);
      const src = ctx.world.repos[gh!.key];
      const id = src.branches[gh!.defaultBranch];
      if (!id) fail(`fatal: You are adding an empty repository as a submodule`);
      const path = pathArg ?? gh!.name;
      if (repo.workdir[path] !== undefined || repo.index[path] !== undefined) fail(`fatal: '${path}' already exists in the index`);
      const entry = `[submodule "${path}"]\n\tpath = ${path}\n\turl = ${ghUrl(gh!)}\n`;
      repo.workdir[".gitmodules"] = (repo.workdir[".gitmodules"] ?? "") + entry;
      repo.index[".gitmodules"] = repo.workdir[".gitmodules"];
      repo.workdir[path] = `${SUB_PREFIX}${id}\n`;
      repo.index[path] = repo.workdir[path];
      ctx.out(`Cloning into '${PROJECT_PATH}/${path}'...\ndone.`);
      ctx.out(`branchwise: the folder '${path}' is a whole separate repository. Your project only records which commit it points at (${short(id)}).`, "hint");
      ctx.emit({ type: "files", repo: ctx.key });
      return;
    }
    case "status":
    case undefined: {
      for (const m of mods) {
        const pinned = (repo.index[m.path] ?? "").replace(SUB_PREFIX, "").trim();
        ctx.out(` ${pinned} ${m.path} (heads/main)`);
      }
      return;
    }
    case "update": {
      const remote = rest.includes("--remote");
      for (const m of mods) {
        const gh = findGh(ctx.world, m.url);
        if (!gh) continue;
        const pinned = (repo.workdir[m.path] ?? "").replace(SUB_PREFIX, "").trim();
        if (remote) {
          const latest = ctx.world.repos[gh.key].branches[gh.defaultBranch];
          if (latest && latest !== pinned) {
            repo.workdir[m.path] = `${SUB_PREFIX}${latest}\n`;
            ctx.out(`Submodule path '${m.path}': checked out '${latest}'`);
          }
        } else if (rest.includes("--init")) ctx.out(`Submodule '${m.path}' (${m.url}) registered for path '${m.path}'\nSubmodule path '${m.path}': checked out '${pinned}'`);
      }
      ctx.emit({ type: "files", repo: ctx.key });
      return;
    }
    default:
      fail(`usage: git submodule [add | status | update [--init] [--remote]]`);
  }
};

export { headId, requireCommit };
