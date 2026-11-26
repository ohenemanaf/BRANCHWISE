import { createGhRepo, teammateCommit } from "./github";
import { emptyWorld, headId, resolveRev } from "./repo";
import { mutate, run, script } from "./run";
import type { RunResult, World } from "./types";

export const text = (r: RunResult) => r.output.map((l) => l.text).join("\n");

/** Fresh local repo with one commit on main. */
export function basicRepo(): World {
  return script(emptyWorld(), ["git init", 'echo "hello" > README.md', "git add README.md", 'git commit -m "Initial commit"']);
}

/** A GitHub repo you/project with one commit, cloned locally. */
export function clonedRepo(): World {
  const w = mutate(emptyWorld(), (d) => {
    createGhRepo(d, "origin", "you", "project");
    teammateCommit(d, "origin", "main", { "README.md": "# Project\n", "app.js": "console.log('hi')\n" }, "Initial commit", "You");
  });
  return script(w, ["git clone https://github.com/you/project.git"]);
}

export function sh(world: World, ...lines: string[]): { world: World; last: RunResult; all: RunResult[] } {
  let w = world;
  const all: RunResult[] = [];
  for (const l of lines) {
    const r = run(w, l);
    all.push(r);
    w = r.world;
  }
  return { world: w, last: all[all.length - 1], all };
}

export const local = (w: World) => w.repos[w.cwd];
export const head = (w: World) => headId(local(w));
export const rev = (w: World, r: string) => resolveRev(local(w), r);
export const msg = (w: World, r: string) => local(w).commits[rev(w, r)].message;
