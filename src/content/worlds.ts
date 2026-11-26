import { createGhRepo, teammateCommit } from "@/engine/github";
import { emptyWorld } from "@/engine/repo";
import { mutate, script } from "@/engine/run";
import type { World } from "@/engine/types";

/** Starting worlds shared by the sandbox presets, lessons and mistake scenarios. All deterministic. */

export const CI_YML = [
  "name: CI",
  "on: [push, pull_request]",
  "jobs:",
  "  test:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - uses: actions/setup-node@v4",
  "      - run: npm ci",
  "      - run: npm test",
  "",
].join("\n");

export const empty = (): World => emptyWorld();

export const initialized = (): World => script(emptyWorld(), ["git init"]);

/** A small project with three commits on main. */
export function started(): World {
  return script(emptyWorld(), [
    "git init",
    'echo "# Recipe box" > README.md',
    "git add README.md",
    'git commit -m "Add README"',
    'echo "pancakes" > recipes.txt',
    "git add recipes.txt",
    'git commit -m "Add first recipe"',
    'echo "waffles" >> recipes.txt',
    'git commit -am "Add waffles"',
  ]);
}

/** main and feature have both moved since feature split off. */
export function diverged(): World {
  return script(started(), [
    "git switch -c feature",
    'echo "Recipes for breakfast." >> README.md',
    'git commit -am "Describe the project"',
    'echo "omelette" > eggs.txt',
    "git add eggs.txt",
    'git commit -m "Add eggs page"',
    "git switch main",
    'echo "crepes" >> recipes.txt',
    'git commit -am "Add crepes"',
  ]);
}

/** Both branches changed the same line of recipes.txt: merging conflicts. */
export function conflicting(): World {
  return script(started(), [
    "git switch -c spicy",
    'echo "pancakes\nwaffles with chili" > recipes.txt',
    'git commit -am "Make waffles spicy"',
    "git switch main",
    'echo "pancakes\nwaffles with syrup" > recipes.txt',
    'git commit -am "Add syrup to waffles"',
  ]);
}

/** You and a teammate share you/project on GitHub; you have a fresh clone. */
export function team(opts: { protect?: boolean; ci?: boolean } = {}): World {
  let w = mutate(emptyWorld(), (d) => {
    createGhRepo(d, "origin", "you", "project");
    teammateCommit(d, "origin", "main", { "README.md": "# Project\n", "app.js": "export const add = (a, b) => a + b;\n" }, "Initial commit", "You");
    teammateCommit(d, "origin", "main", { "CONTRIBUTING.md": "Open a pull request for every change.\n" }, "Add contributing guide");
    if (opts.ci) {
      teammateCommit(d, "origin", "main", { ".github/workflows/ci.yml": CI_YML }, "Add CI workflow");
      d.testRule = { path: "app.js", failsWhen: "a - b" };
    }
    if (opts.protect) d.github.repos.origin.protection.main = { requirePullRequest: true, requireApproval: true, requireChecks: !!opts.ci };
  });
  w = script(w, ["git clone https://github.com/you/project.git"]);
  return w;
}

/** An open-source project you don't own yet: acme/recipes. Not cloned. */
export function openSource(): World {
  return mutate(emptyWorld(), (d) => {
    createGhRepo(d, "upstream", "acme", "recipes");
    teammateCommit(d, "upstream", "main", { "README.md": "# Recipes\nCommunity recipes. PRs welcome!\n", "recipes/pancakes.md": "# Pancakes\n" }, "Initial commit", "acme-bot");
    teammateCommit(d, "upstream", "main", { "recipes/waffles.md": "# Waffles\n" }, "Add waffles", "maria");
    d.teammate = "maria";
  });
}

/** Ten commits; one of them introduced a bug that `npm test` catches. */
export function bisectable(badAt = 6): World {
  let w = mutate(started(), (d) => {
    d.testRule = { path: "calc.js", failsWhen: "a - b" };
  });
  const lines: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const body = i >= badAt ? "export const add = (a, b) => a - b;" : "export const add = (a, b) => a + b;";
    lines.push(`echo "${body}\n// v${i}" > calc.js`, "git add calc.js", `git commit -m "${COMMIT_MSGS[i - 1]}"`);
  }
  w = script(w, lines);
  return w;
}

const COMMIT_MSGS = [
  "Add calculator",
  "Format calculator",
  "Add comments",
  "Rename variables",
  "Tidy imports",
  "Simplify add()",
  "Update docs",
  "Bump version",
  "Fix typo in comment",
  "Add changelog entry",
];

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  build: () => World;
  hint: string;
}

export const PRESETS: Preset[] = [
  { id: "blank", name: "Empty folder", blurb: "Start from nothing.", build: empty, hint: "Start with: git init" },
  { id: "started", name: "Small project", blurb: "Three commits on main.", build: started, hint: "Try: git switch -c idea, then commit something" },
  { id: "diverged", name: "Two branches", blurb: "main and feature both moved on.", build: diverged, hint: "Try: git merge feature, or git switch feature && git rebase main" },
  { id: "conflict", name: "Merge conflict", blurb: "Two branches edited the same line.", build: conflicting, hint: "Try: git merge spicy, then fix recipes.txt in the Files panel" },
  { id: "team", name: "Team project on GitHub", blurb: "You cloned a repo you share with a teammate.", build: () => team(), hint: "Try: git switch -c my-change, commit, git push -u origin my-change, gh pr create --fill" },
  { id: "protected", name: "Protected main + CI", blurb: "PRs need an approval and green checks.", build: () => team({ protect: true, ci: true }), hint: "Direct pushes to main are rejected. Branch, push, open a PR." },
  { id: "open-source", name: "Contribute to open source", blurb: "acme/recipes isn't yours. Fork it.", build: openSource, hint: "Start with: gh repo fork acme/recipes --clone" },
  { id: "bisect", name: "Find the bug", blurb: "One of ten commits broke the tests.", build: () => bisectable(), hint: "Try: npm test, then git bisect start HEAD HEAD~9 and git bisect run npm test" },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[1];
