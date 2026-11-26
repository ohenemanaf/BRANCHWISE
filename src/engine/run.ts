import { type Command, type Ctx, makeCtx, printError } from "./context";
import { GitError } from "./repo";
import { parseLine } from "./shell";
import type { EngineEvent, Line, RebaseStep, RunResult, World } from "./types";
import * as basics from "./commands/basics";
import * as branching from "./commands/branching";
import * as history from "./commands/history";
import * as remote from "./commands/remote";
import * as files from "./commands/files";
import { gh } from "./commands/gh";

export const gitCommands: Record<string, Command> = {
  init: basics.init,
  config: basics.config,
  status: basics.statusCmd,
  add: basics.add,
  rm: basics.rm,
  mv: basics.mv,
  commit: basics.commit,
  log: basics.log,
  show: basics.show,
  diff: basics.diff,
  restore: basics.restore,
  branch: branching.branch,
  switch: branching.switchCmd,
  checkout: branching.checkout,
  tag: branching.tag,
  reflog: branching.reflog,
  merge: history.merge,
  rebase: history.rebase,
  "cherry-pick": history.cherryPick,
  revert: history.revert,
  reset: history.reset,
  stash: history.stash,
  bisect: history.bisect,
  remote: remote.remote,
  fetch: remote.fetch,
  pull: remote.pull,
  push: remote.push,
  clone: remote.clone,
};

/** Real git commands this simulator knowingly doesn't model. */
const notSimulated = ["worktree", "blame", "clean", "gc", "notes", "archive", "describe", "shortlog", "grep", "am", "apply", "format-patch", "submodule", "sparse-checkout", "lfs", "filter-branch", "range-diff", "maintenance"];

const shell: Record<string, Command> = {
  ls: files.ls,
  cat: files.cat,
  touch: files.touch,
  echo: files.echo,
  rm: files.rmFile,
  mv: files.mvFile,
  mkdir: files.mkdir,
  pwd: files.pwd,
  cd: files.cd,
  npm: files.npm,
  "./test.sh": files.testScript,
  write: files.write,
  gh,
};

function gitDispatch(ctx: Ctx, argv: string[]): number | void {
  const [sub, ...rest] = argv;
  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    ctx.out("usage: git <command> [<args>]\n\nThe commands this sandbox simulates:", "muted");
    ctx.out("  " + Object.keys(gitCommands).join(", "));
    ctx.out("\nAlso: ls, cat, touch, echo \"text\" > file, rm, npm test, gh repo|pr|run, clear", "muted");
    return;
  }
  if (sub === "--version" || sub === "version") {
    ctx.out("git version 2.54.0 (branchwise simulator)");
    return;
  }
  const fn = gitCommands[sub];
  if (fn) return fn(ctx, rest);
  if (notSimulated.includes(sub)) throw new GitError([`branchwise: 'git ${sub}' is real, but this sandbox doesn't simulate it.`], ["hint: the Cheat codes tab explains what it does"]);
  const near = Object.keys(gitCommands).find((c) => c.startsWith(sub.slice(0, 3)));
  throw new GitError([`git: '${sub}' is not a git command. See 'git --help'.`], near ? ["", "The most similar command is", `\t${near}`] : []);
}

function dispatch(ctx: Ctx, argv: string[]): number | void {
  const [cmd, ...rest] = argv;
  if (cmd === "git") return gitDispatch(ctx, rest);
  if (cmd === "clear") {
    ctx.emit({ type: "clear" });
    return;
  }
  const fn = shell[cmd];
  if (fn) return fn(ctx, rest);
  throw new GitError([`bash: ${cmd}: command not found`], cmd.startsWith("git") ? ["hint: did you mean `git " + cmd.slice(3) + "`?"] : []);
}

/**
 * Run one terminal line against a world. Never mutates `world`; a failing command
 * leaves the state exactly as it was before that command (like Git's atomic refs).
 */
export function run(world: World, line: string): RunResult {
  const output: Line[] = [];
  const events: EngineEvent[] = [];
  let current = world;
  let ok = true;
  let commands;
  try {
    commands = parseLine(line);
  } catch (e) {
    if (e instanceof GitError) return { world, output: e.lines.map((t) => ({ text: t, tone: "error" })), events, ok: false };
    throw e;
  }
  for (const c of commands) {
    const draft = structuredClone(current);
    const cmdOut: Line[] = [];
    const cmdEvents: EngineEvent[] = [];
    const ctx = makeCtx(draft, cmdOut, cmdEvents);
    let code: number | void = 0;
    try {
      code = dispatch(ctx, c.argv);
    } catch (e) {
      if (!(e instanceof GitError)) throw e;
      printError(ctx, e);
      output.push(...cmdOut);
      ok = false;
      break;
    }
    if (c.redirect) {
      const text = cmdOut.map((l) => l.text).join("\n");
      const repo = draft.repos[draft.cwd];
      const path = c.redirect.file.replace(/^\.\//, "");
      const prev = c.redirect.op === ">>" ? (repo.workdir[path] ?? "") : "";
      repo.workdir[path] = prev + (text ? text + "\n" : "");
      cmdEvents.push({ type: "files", repo: draft.cwd });
    } else output.push(...cmdOut);
    events.push(...cmdEvents);
    current = draft;
    if (code) {
      ok = false;
      break;
    }
  }
  return { world: current, output, events, ok };
}

/** Run several lines, throwing if any fails. For building lesson/scenario worlds. */
export function script(world: World, lines: string[]): World {
  let w = world;
  for (const l of lines) {
    const r = run(w, l);
    if (!r.ok) throw new Error(`script failed at "${l}":\n${r.output.map((o) => o.text).join("\n")}`);
    w = r.world;
  }
  return w;
}

/** Apply an interactive-rebase todo list chosen in the UI editor. */
export function runRebaseTodo(world: World, onto: string, steps: RebaseStep[], label: string): RunResult {
  const draft = structuredClone(world);
  const output: Line[] = [];
  const events: EngineEvent[] = [];
  const ctx = makeCtx(draft, output, events);
  try {
    const code = history.startRebase(ctx, onto, steps, label);
    return { world: draft, output, events, ok: !code };
  } catch (e) {
    if (!(e instanceof GitError)) throw e;
    const o: Line[] = [];
    printError(makeCtx(world, o, []), e);
    return { world, output: o, events: [], ok: false };
  }
}

/** Apply an arbitrary mutation to a copy of the world (teammate actions, scenario setup). */
export function mutate(world: World, fn: (w: World) => void): World {
  const draft = structuredClone(world);
  fn(draft);
  return draft;
}
