import type { Module } from "../types";
import { committedFile, messages, msgAt, noOp, onBranch, repoOf, tip } from "../checks";
import { CI_YML, bisectable, started, team } from "../worlds";
import { createGhRepo, latestRun, teammateCommit } from "@/engine/github";
import { mutate, script } from "@/engine/run";
import type { World } from "@/engine/types";

const wipBranch = (): World =>
  script(started(), [
    "git switch -c search",
    'echo "search box" > search.js',
    "git add search.js",
    'git commit -m "WIP"',
    'echo "search box + results" > search.js',
    'git commit -am "WIP 2"',
    'echo "search box + results (fixed typo)" > search.js',
    'git commit -am "fix typo"',
  ]);

const hotfixWorld = (): World =>
  script(started(), [
    "git branch release",
    'echo "Handle empty list" > fix.txt',
    "git add fix.txt",
    'git commit -m "Fix crash on empty list"',
    'echo "dark mode" > theme.txt',
    "git add theme.txt",
    'git commit -m "Add dark mode (not ready for release)"',
  ]);

const lostWork = (): World =>
  script(started(), ['echo "syrup" > toppings.txt', "git add .", 'git commit -m "Add toppings"', 'echo "berries" >> toppings.txt', 'git commit -am "Add berries"', "git reset --hard HEAD~2"]);

const ciWorld = (): World => {
  let w = mutate(team(), (d) => {
    d.testRule = { path: "app.js", failsWhen: "a - b" };
  });
  w = script(w, ['echo "export const add = (a, b) => a - b;" > app.js', 'git commit -am "Refactor add()"', "git push"]);
  return mutate(w, (d) => {
    d.repos.local.workdir[".github/workflows/ci.yml"] = CI_YML;
  });
};

const submoduleWorld = (): World =>
  mutate(team(), (d) => {
    createGhRepo(d, "tokens", "acme", "design-tokens");
    teammateCommit(d, "tokens", "main", { "colors.json": '{ "brand": "#2453d6" }\n' }, "Add brand colour", "acme-bot");
  });

export const advanced: Module = {
  slug: "advanced",
  title: "Advanced Git",
  summary: "Rewrite local history, move single commits, recover lost work, hunt bugs, and look inside .git.",
  lessons: [
    {
      slug: "interactive-rebase",
      title: "Clean up commits with interactive rebase",
      summary: "Squash, reword, reorder and drop commits before you share them.",
      minutes: 8,
      start: wipBranch,
      cheats: ["git-rebase-i", "git-commit-amend", "git-reset-soft"],
      steps: [
        {
          kind: "read",
          title: "Tidy before you push",
          body: "Your `search` branch has three commits: *WIP*, *WIP 2*, *fix typo*. Reviewers would rather see one commit that says what it does.\n\n`git rebase -i <base>` opens a **todo list** of your commits, oldest first. For each one you choose:\n\n- `pick`: keep it\n- `reword`: keep it, change the message\n- `squash` / `fixup`: fold it into the commit above\n- `drop`: delete it\n\nYou can also reorder the lines. Like any rebase, the result is new commits.",
        },
        {
          kind: "try",
          title: "Squash three into one",
          body: "Run `git rebase -i main`. In the editor that opens, set the second and third rows to **squash** or **fixup**, and give the result the message `Add search`. Then start the rebase.",
          goal: "search is one commit on top of main, called \"Add search\"",
          check: (w) => {
            const m = messages(w, "search", 2);
            return m[0] === "Add search" && repoOf(w).commits[tip(w, "search")!].parents[0] === tip(w, "main") && committedFile(w, "search.js", "search")?.includes("fixed typo") === true;
          },
          hint: "Pick the first row, fixup the other two, and reword the first to \"Add search\". Without the editor, git reset --soft main followed by git commit -m \"Add search\" gives the same result.",
          answer: ["git reset --soft main", 'git commit -m "Add search"'],
        },
        {
          kind: "read",
          title: "Just the last commit?",
          body: "To change only your most recent commit, `git commit --amend` is quicker. Stage any extra changes, then amend, and add `-m` for a new message. The same rule applies: amend only what you haven't pushed.",
        },
      ],
    },
    {
      slug: "cherry-pick",
      title: "Cherry-pick one commit",
      summary: "Copy a single commit onto another branch, like a hotfix onto a release branch.",
      minutes: 5,
      start: hotfixWorld,
      cheats: ["git-cherry-pick", "git-log"],
      steps: [
        {
          kind: "read",
          title: "Just that one fix, please",
          body: "`main` has two new commits: an important bug fix and a half-finished dark mode. The `release` branch needs the fix **without** dark mode, so merging main is out.\n\n`git cherry-pick <commit>` copies one commit's change onto your current branch as a new commit.",
        },
        {
          kind: "try",
          title: "Pick the fix",
          body: "Switch to `release` and cherry-pick *Fix crash on empty list*. Click its station to paste its ID, or use `main~1`.",
          goal: "release has the fix but not dark mode",
          check: (w) => msgAt(w, "release") === "Fix crash on empty list" && committedFile(w, "theme.txt", "release") === undefined && committedFile(w, "fix.txt", "release") !== undefined,
          hint: "git switch release, then git cherry-pick main~1",
          answer: ["git switch release", "git cherry-pick main~1"],
        },
        {
          kind: "read",
          title: "A copy, not a move",
          body: "Look at the graph: the fix is now on both branches as two commits with **different IDs** and the same change. Git notices this later. If you rebase release onto main, it skips the duplicate.",
        },
      ],
    },
    {
      slug: "reflog",
      title: "The reflog: Git's undo history",
      summary: "Find commits that no branch points to any more and bring them back.",
      minutes: 6,
      start: lostWork,
      cheats: ["git-reflog", "git-reset-hard", "git-branch"],
      mistakes: ["lost-commits-reset", "deleted-branch"],
      steps: [
        {
          kind: "read",
          title: "Nothing is really gone (for a while)",
          body: "Someone ran `git reset --hard HEAD~2` and two commits, *Add toppings* and *Add berries*, disappeared from `main`. They still exist. The faded stations on the graph are commits no branch points to.\n\nGit records every move of HEAD in the **reflog**. Run `git reflog` and you'll see `HEAD@{1}`, the commit you were on before the reset.",
        },
        {
          kind: "try",
          title: "Bring them back",
          body: "Find *Add berries* in `git reflog`, then move `main` back to it. Use `git reset --hard <id>`, or `git reset --hard HEAD@{1}`.",
          goal: "main is back at \"Add berries\"",
          check: (w) => onBranch(w, "main") && msgAt(w, "main") === "Add berries",
          hint: "git reflog, then git reset --hard HEAD@{1}",
          answer: ["git reset --hard HEAD@{1}"],
        },
        {
          kind: "read",
          title: "Limits",
          body: "The reflog is **local**. It exists only on your computer and entries expire (about 90 days by default). It also can't save changes you never committed: `git reset --hard` on uncommitted edits destroys them. Commit often.",
        },
      ],
    },
    {
      slug: "bisect",
      title: "Find a bug with bisect",
      summary: "Binary-search your history for the commit that broke the tests.",
      minutes: 7,
      start: () => bisectable(),
      cheats: ["git-bisect", "git-bisect-run"],
      steps: [
        {
          kind: "read",
          title: "Ten commits, one bug",
          body: "Run `npm test`: it fails now. It passed back at *Add calculator*. One of the ten commits in between broke it.\n\n`git bisect` checks out the commit halfway between a known-good and a known-bad commit. You test it and say `git bisect good` or `git bisect bad`, and it halves the range again. Ten commits take about 4 tests.",
        },
        {
          kind: "try",
          title: "Hunt it down",
          body: "Start with `git bisect start HEAD HEAD~9` (bad first, then good). Then either test each step yourself with `npm test` and `git bisect good` / `bad`, or let Git do it: `git bisect run npm test`.\n\nWhen Git names the first bad commit, mark it with `git branch culprit <id>` and finish with `git bisect reset`.",
          goal: "Branch culprit points at the first bad commit, and bisect is finished",
          check: (w) => msgAt(w, "culprit") === "Simplify add()" && repoOf(w).bisect === null && onBranch(w, "main"),
          hint: "git bisect start HEAD HEAD~9, git bisect run npm test, then git branch culprit <the id it printed>, git bisect reset",
          answer: ["git bisect start HEAD HEAD~9", "git bisect run npm test", "git branch culprit main~4", "git bisect reset"],
        },
      ],
    },
    {
      slug: "internals",
      title: "Inside the .git folder",
      summary: "Commits, trees and blobs, and why a branch is a 41-byte file.",
      minutes: 7,
      start: () => script(started(), ["git branch experiment"]),
      cheats: ["git-cat-file", "git-rev-parse", "git-branch-f", "head-file"],
      steps: [
        {
          kind: "read",
          title: "Objects and refs",
          body: "Git's database has two parts:\n\n- **Objects**: *blobs* (file contents), *trees* (folders listing blobs) and *commits* (a tree, parent IDs, author and message). Each is named by a hash of its contents, so they never change.\n- **Refs**: tiny text files holding one commit ID. `.git/refs/heads/main` *is* the main branch. `.git/HEAD` says which branch you're on.\n\nEverything else, including branching, merging and rebasing, is creating objects and rewriting those small files.",
        },
        {
          kind: "watch",
          title: "Look inside",
          body: "Follow the chain: HEAD names a branch, the branch file holds a commit ID, the commit points at a tree, and the tree lists blobs.",
          commands: ["cat .git/HEAD", "cat .git/refs/heads/main", "git cat-file -p HEAD", "ls .git/refs/heads"],
        },
        {
          kind: "try",
          title: "Move a label by hand",
          body: "Since a branch is only a pointer, you can aim it anywhere. Point `experiment` at the **first** commit without switching to it: `git branch -f experiment <commit>`. Then `cat .git/refs/heads/experiment` shows the new ID.",
          goal: "experiment points at the root commit",
          check: (w) => {
            const r = repoOf(w);
            const t = r.branches.experiment;
            return !!t && r.commits[t].parents.length === 0;
          },
          hint: "git branch -f experiment HEAD~2",
          answer: ["git branch -f experiment HEAD~2"],
        },
      ],
    },
    {
      slug: "submodules",
      title: "Submodules",
      summary: "Put another repository inside yours, pinned to an exact commit.",
      minutes: 6,
      start: submoduleWorld,
      cheats: ["git-submodule-add", "git-submodule-update"],
      steps: [
        {
          kind: "read",
          title: "A repo inside a repo",
          body: "Sometimes a project depends on another repository, such as shared design tokens. A **submodule** puts that repo in a folder of yours. Your project doesn't store its files. It stores **one commit ID**: \"use design-tokens at exactly this commit\".\n\nThat pin is the point and also the catch. Teammates get the same version every time, but the pin only moves when someone updates it and commits.",
        },
        {
          kind: "try",
          title: "Add one",
          body: "Add `https://github.com/acme/design-tokens.git` as a submodule in a folder called `tokens`, then commit. Look at the `tokens` entry afterwards (`cat tokens`): it's just the pinned commit.",
          goal: "A commit records .gitmodules and the tokens pin",
          check: (w) => committedFile(w, ".gitmodules") !== undefined && (committedFile(w, "tokens") ?? "").startsWith("Subproject commit"),
          hint: 'git submodule add https://github.com/acme/design-tokens.git tokens, then git commit -m "Add design tokens"',
          answer: ["git submodule add https://github.com/acme/design-tokens.git tokens", 'git commit -m "Add design tokens"'],
        },
        {
          kind: "read",
          title: "Day-to-day",
          body: "- Cloning a project with submodules? Run `git submodule update --init` to fetch them.\n- To move the pin to the latest version: `git submodule update --remote`, then commit the changed pin.\n\nThis sandbox shows the pin, not the nested repo's own history. In real Git, `tokens/` is a full working copy you can `cd` into.",
        },
      ],
    },
    {
      slug: "github-actions",
      title: "GitHub Actions basics",
      summary: "A workflow file that runs your tests on every push and pull request.",
      minutes: 8,
      start: ciWorld,
      cheats: ["github-actions", "gh-run-list", "gh-pr-checks"],
      steps: [
        {
          kind: "read",
          title: "Robots that run your tests",
          body: "**GitHub Actions** runs scripts on GitHub's servers when something happens in your repo. A workflow is a YAML file in `.github/workflows/`. Open `ci.yml` in the Files panel:\n\n- `on: [push, pull_request]`: when to run\n- `jobs:`, then `steps:`: what to run, in order. `uses:` borrows a ready-made action, `run:` runs a shell command.\n\nIf any step fails, the run fails and the PR shows a red ✗. With branch protection, a red ✗ blocks the merge.",
        },
        {
          kind: "try",
          title: "Turn on CI",
          body: "The workflow file exists but isn't committed. Commit it and push. Then look at the run in the GitHub tab, or with `gh run list`.",
          goal: "A CI run happened on main",
          check: (w) => w.github.runs.some((r) => r.branch === "main"),
          hint: 'git add .github, git commit -m "Add CI", git push',
          answer: ["git add .github", 'git commit -m "Add CI"', "git push"],
        },
        {
          kind: "try",
          title: "Make it green",
          body: "It failed: the last refactor turned `a + b` into `a - b`. Run `npm test` to see it locally. Fix `app.js` so `add` uses `+`, commit, push, and watch the next run.",
          goal: "The latest run on main passed",
          check: (w) => {
            const t = w.repos.origin.branches.main;
            return latestRun(w, t)?.status === "success";
          },
          hint: 'echo "export const add = (a, b) => a + b;" > app.js, git commit -am "Fix add()", git push',
          answer: ['echo "export const add = (a, b) => a + b;" > app.js', 'git commit -am "Fix add()"', "git push"],
        },
      ],
    },
  ],
};

export { noOp };
