import { type Command, PROJECT_PATH } from "../context";
import { fail, status } from "../repo";
import { runTests } from "./history";
import { gitFile, listGitDir } from "./plumbing";

/** Shell builtins that only touch the working directory. */

const norm = (p: string) => p.replace(/^\.\//, "").replace(/\/+$/, "");

export const ls: Command = (ctx, argv) => {
  const all = argv.includes("-a") || argv.includes("-la") || argv.includes("-al");
  const dir = norm(argv.find((x) => !x.startsWith("-")) ?? "");
  if (dir === ".git" || dir.startsWith(".git/")) {
    const list = listGitDir(ctx, dir);
    if (!list) fail(`ls: cannot access '${dir}': No such file or directory`);
    list!.forEach((n) => ctx.out(n, n.endsWith("/") ? "hint" : "normal"));
    return;
  }
  const names = new Set<string>();
  for (const p of Object.keys(ctx.repo.workdir)) {
    if (dir && !p.startsWith(dir + "/")) continue;
    const rest = dir ? p.slice(dir.length + 1) : p;
    const first = rest.split("/")[0];
    if (!all && first.startsWith(".")) continue;
    names.add(rest.includes("/") ? first + "/" : first);
  }
  if (all && ctx.repo.initialized && !dir) names.add(".git/");
  if (!names.size && dir) fail(`ls: cannot access '${dir}': No such file or directory`);
  const st = status(ctx.repo);
  const untracked = new Set(st.untracked);
  [...names].sort().forEach((n) => ctx.out(n, untracked.has(dir ? `${dir}/${n}` : n) ? "error" : n.endsWith("/") ? "hint" : "normal"));
};

export const cat: Command = (ctx, argv) => {
  if (!argv.length) fail("cat: missing file operand");
  for (const f of argv) {
    const p = norm(f);
    if (p.startsWith(".git/")) {
      const g = gitFile(ctx, p);
      if (g === null) fail(`cat: ${f}: No such file or directory`);
      ctx.out(g!);
      continue;
    }
    const c = ctx.repo.workdir[p];
    if (c === undefined) fail(`cat: ${f}: No such file or directory`);
    if (c) ctx.out(c.replace(/\n$/, ""));
  }
};

export const touch: Command = (ctx, argv) => {
  if (!argv.length) fail("touch: missing file operand");
  for (const f of argv) {
    const p = norm(f);
    if (!(p in ctx.repo.workdir)) ctx.repo.workdir[p] = "";
  }
  ctx.emit({ type: "files", repo: ctx.key });
};

export const echo: Command = (ctx, argv) => {
  ctx.out(argv.filter((a) => a !== "-e" && a !== "-n").join(" "));
};

export const rmFile: Command = (ctx, argv) => {
  const targets = argv.filter((a) => !a.startsWith("-"));
  if (!targets.length) fail("rm: missing operand");
  for (const t of targets) {
    const p = norm(t);
    const hits = Object.keys(ctx.repo.workdir).filter((k) => k === p || k.startsWith(p + "/"));
    if (!hits.length) fail(`rm: cannot remove '${t}': No such file or directory`);
    if (hits.some((h) => h !== p) && !argv.some((a) => /^-\w*r/.test(a))) fail(`rm: cannot remove '${t}': Is a directory`);
    hits.forEach((h) => delete ctx.repo.workdir[h]);
  }
  ctx.emit({ type: "files", repo: ctx.key });
};

export const mvFile: Command = (ctx, argv) => {
  const [a, b] = argv.filter((x) => !x.startsWith("-"));
  if (!a || !b) fail("mv: missing file operand");
  const from = norm(a);
  if (!(from in ctx.repo.workdir)) fail(`mv: cannot stat '${a}': No such file or directory`);
  ctx.repo.workdir[norm(b)] = ctx.repo.workdir[from];
  delete ctx.repo.workdir[from];
  ctx.emit({ type: "files", repo: ctx.key });
};

export const mkdir: Command = (ctx, argv) => {
  const d = argv.find((x) => !x.startsWith("-"));
  if (!d) fail("mkdir: missing operand");
  ctx.out(`branchwise: folders appear when they hold a file (Git doesn't track empty folders either) — try touch ${norm(d!)}/.gitkeep`, "hint");
};

export const pwd: Command = (ctx) => {
  ctx.out(PROJECT_PATH);
};

export const cd: Command = (ctx, argv) => {
  const d = argv[0];
  if (!d || d === "." || d === "~" || d === PROJECT_PATH || d === "project" || d === ctx.repo.name) return;
  fail(`branchwise: this sandbox has one project folder — no need to cd into '${d}'`);
};

export const npm: Command = (ctx, argv) => {
  if (argv[0] === "test" || argv[0] === "t" || (argv[0] === "run" && argv[1] === "test")) return runTests(ctx);
  if (argv[0] === "install" || argv[0] === "i" || argv[0] === "ci") {
    ctx.out("added 0 packages in 0.1s (simulated)", "muted");
    return;
  }
  fail(`branchwise: only "npm test" is simulated here`);
};

export const testScript: Command = (ctx) => runTests(ctx);

/** Write content into a file from the UI's editor ("edit" with content arg in scripts). */
export const write: Command = (ctx, argv) => {
  const [f, ...rest] = argv;
  if (!f) fail("usage: write <file> <content>");
  ctx.repo.workdir[norm(f)] = rest.join(" ").replace(/\\n/g, "\n");
  if (!ctx.repo.workdir[norm(f)].endsWith("\n") && ctx.repo.workdir[norm(f)]) ctx.repo.workdir[norm(f)] += "\n";
  ctx.emit({ type: "files", repo: ctx.key });
};
