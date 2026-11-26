import type { Module } from "../types";
import { clean, commitCount, committedFile, msgAt, noUntracked, repoOf } from "../checks";
import { empty, started } from "../worlds";
import { script } from "@/engine/run";
import { status } from "@/engine/repo";

export const basics: Module = {
  slug: "git-basics",
  title: "Git basics",
  summary: "Snapshots, the staging area, reading history and undoing changes before they're committed.",
  lessons: [
    {
      slug: "first-commit",
      title: "A commit is a snapshot",
      summary: "Turn a folder into a repository and save your first snapshot.",
      minutes: 5,
      start: empty,
      cheats: ["git-init", "git-add", "git-commit", "git-status"],
      steps: [
        {
          kind: "read",
          title: "What Git actually stores",
          body: "Git doesn't save a list of edits. Each **commit** is a full snapshot of your project at one moment, plus a message, an author and a link to the commit before it (its **parent**).\n\nOn the graph each commit is a station. A line joins it to its parent, so the history reads left to right like a train line.\n\nThe folder on the right is empty, and it isn't a Git repository yet.",
        },
        {
          kind: "watch",
          title: "Make a repository",
          body: "`git init` creates a hidden `.git` folder where Git keeps every snapshot. Your files stay where they are. Press play and watch the terminal.",
          commands: ["git init", "git status"],
        },
        {
          kind: "try",
          title: "Your first commit",
          body: "Saving a snapshot takes two steps. `git add` picks the files that go into the next snapshot, and `git commit` saves it with a message.\n\nCreate a file with `echo \"# Recipe box\" > README.md`, add it, then commit it with `git commit -m \"Add README\"`.",
          goal: "The repository has one commit that contains README.md",
          check: (w) => commitCount(w) >= 1 && committedFile(w, "README.md") !== undefined,
          hint: "Three commands: echo \"# Recipe box\" > README.md, then git add README.md, then git commit -m \"Add README\".",
          answer: ['echo "# Recipe box" > README.md', "git add README.md", 'git commit -m "Add README"'],
        },
        {
          kind: "try",
          title: "And another",
          body: "Edit the file (click it in the Files panel, or use `echo \"Breakfast recipes\" >> README.md`) and commit again. Watch the new station appear after the first one. The `main` label moves forward with it, because a branch always points at its newest commit.",
          goal: "Two commits on main",
          check: (w) => commitCount(w) >= 2,
          hint: "Change README.md, then git add README.md and git commit -m \"Describe the project\". Or use git commit -am, which adds tracked files for you.",
          answer: ['echo "Breakfast recipes" >> README.md', 'git commit -am "Describe the project"'],
        },
        {
          kind: "read",
          title: "What you just did",
          body: "- `git init` started tracking the folder.\n- `git add` staged a file (more on that next).\n- `git commit` saved a snapshot. Every commit gets an ID, the short code under each station, worked out from its contents.\n\nRun `git log` to see both commits listed newest first.",
        },
      ],
    },
    {
      slug: "staging-area",
      title: "The staging area",
      summary: "Why there's a step between editing and committing, and how to use it.",
      minutes: 6,
      start: started,
      cheats: ["git-add", "git-status", "git-diff", "git-commit"],
      steps: [
        {
          kind: "read",
          title: "Three places a file lives",
          body: "A change moves through three places:\n\n- **Working folder**: the files you edit.\n- **Staging area** (also called the index): what the next commit will contain.\n- **Repository**: the commits you've already saved.\n\nThe staging area lets you commit *some* of your changes and keep working on the rest. The Files panel shows where each file stands.",
        },
        {
          kind: "watch",
          title: "Watch a file move through",
          body: "Two files change, but only one gets staged. `git status` reports each group separately.",
          commands: ['echo "maple syrup" > toppings.txt', 'echo "pancakes\nwaffles\nfrench toast" > recipes.txt', "git status", "git add toppings.txt", "git status"],
        },
        {
          kind: "try",
          title: "Commit only part of your work",
          body: "Commit **only** `toppings.txt`. The change to `recipes.txt` should stay uncommitted in your working folder.\n\nUse `git diff` to see unstaged changes and `git diff --staged` to see what's about to be committed.",
          goal: "The last commit adds toppings.txt, and recipes.txt is still modified but not committed",
          check: (w) => committedFile(w, "toppings.txt") !== undefined && status(repoOf(w)).unstaged.some((u) => u.path === "recipes.txt") && !(committedFile(w, "recipes.txt") ?? "").includes("french toast"),
          hint: "toppings.txt is already staged. Run git commit -m \"Add toppings\" and don't add recipes.txt.",
          answer: ['git commit -m "Add toppings"'],
        },
        {
          kind: "try",
          title: "Now the rest",
          body: "Stage `recipes.txt` and commit it. Afterwards `git status` should say *nothing to commit, working tree clean*.",
          goal: "Working tree clean, french toast committed",
          check: (w) => clean(w) && (committedFile(w, "recipes.txt") ?? "").includes("french toast"),
          hint: "git add recipes.txt, then git commit -m \"Add french toast\".",
          answer: ["git add recipes.txt", 'git commit -m "Add french toast"'],
        },
      ],
    },
    {
      slug: "reading-history",
      title: "Reading history",
      summary: "log, show and diff, plus how to name any commit with HEAD~2.",
      minutes: 6,
      start: started,
      cheats: ["git-log", "git-show", "git-diff", "git-tag", "revision-syntax"],
      steps: [
        {
          kind: "read",
          title: "HEAD is where you are",
          body: "**HEAD** means \"the commit you're on right now\". On the graph it's the filled station with the `HEAD → main` label.\n\nYou can count back from it: `HEAD~1` is its parent, `HEAD~2` the one before that. This works for any branch too: `main~1`.",
        },
        {
          kind: "watch",
          title: "Three ways to look back",
          body: "`git log --oneline` lists the commits. `git show` shows one commit and what it changed. `git diff A B` compares any two commits.",
          commands: ["git log --oneline", "git show HEAD~1", "git diff HEAD~2 HEAD"],
        },
        {
          kind: "try",
          title: "Label the very first commit",
          body: "A **tag** is a permanent name for one commit, often used for releases. Tag the first commit (the one that added the README) as `v0.1`. Count back from HEAD to name it, or click its station to paste its ID into the terminal.",
          goal: "Tag v0.1 points at the first commit",
          check: (w) => {
            const r = repoOf(w);
            const t = r.tags["v0.1"];
            return !!t && r.commits[t].parents.length === 0;
          },
          hint: "There are three commits, so the first one is HEAD~2: git tag v0.1 HEAD~2",
          answer: ["git tag v0.1 HEAD~2"],
        },
      ],
    },
    {
      slug: "undo-uncommitted",
      title: "Undo before you commit",
      summary: "Throw away an edit, or take a file back out of the staging area.",
      minutes: 5,
      start: () => script(started(), ['echo "oops" > recipes.txt', 'echo "draft" > notes.txt', "git add notes.txt"]),
      cheats: ["git-restore", "git-restore-staged", "git-status"],
      mistakes: ["staged-wrong-file"],
      steps: [
        {
          kind: "read",
          title: "Two kinds of undo",
          body: "Before you commit, there are two undos:\n\n- `git restore <file>` throws away changes in your working folder and puts the file back to the staged (or last committed) version. **The edit is gone for good.** Git never saw it, so it can't bring it back.\n- `git restore --staged <file>` takes a file out of the staging area. Your edit stays in the working folder.\n\nRight now `recipes.txt` has been overwritten by accident, and `notes.txt` is staged but shouldn't be.",
        },
        {
          kind: "try",
          title: "Clean up",
          body: "Restore `recipes.txt` to its committed version, and unstage `notes.txt` without deleting it. Check with `git status`.",
          goal: "recipes.txt matches the last commit; notes.txt is untracked but still exists",
          check: (w) => {
            const r = repoOf(w);
            const s = status(r);
            return r.workdir["recipes.txt"] === committedFile(w, "recipes.txt") && s.untracked.includes("notes.txt") && !s.staged.length;
          },
          hint: "git restore recipes.txt, then git restore --staged notes.txt",
          answer: ["git restore recipes.txt", "git restore --staged notes.txt"],
        },
      ],
    },
    {
      slug: "gitignore",
      title: "Ignoring files",
      summary: "Keep secrets, build output and dependencies out of your repository.",
      minutes: 5,
      start: () => script(started(), ['echo "API_KEY=sk-123" > .env', 'echo "cache" > debug.log', "touch node_modules/react/index.js"]),
      cheats: ["gitignore", "git-rm-cached", "git-status"],
      mistakes: ["committed-secret"],
      steps: [
        {
          kind: "read",
          title: "Not everything belongs in Git",
          body: "Some files should never be committed. That includes secrets (`.env`), installed dependencies (`node_modules/`), and logs or build output. A file called `.gitignore` lists patterns, and Git stops offering matching files in `git status` and `git add .`.\n\nRun `git status`: three things show up as untracked right now.",
        },
        {
          kind: "try",
          title: "Write a .gitignore",
          body: "Create a `.gitignore` that ignores `.env`, every `.log` file and the `node_modules/` folder, one pattern per line. The **New file** button in the Files panel is easiest. Then commit the `.gitignore` itself so your teammates get it too.",
          goal: "git status shows nothing untracked, and .gitignore is committed",
          check: (w) => noUntracked(w) && committedFile(w, ".gitignore") !== undefined && repoOf(w).index[".env"] === undefined,
          hint: "In the terminal: echo \".env\" > .gitignore, echo \"*.log\" >> .gitignore, echo \"node_modules/\" >> .gitignore, then git add .gitignore and git commit -m \"Add gitignore\".",
          answer: ['echo ".env" > .gitignore', 'echo "*.log" >> .gitignore', 'echo "node_modules/" >> .gitignore', "git add .gitignore", 'git commit -m "Add gitignore"'],
        },
        {
          kind: "read",
          title: "Already committed it?",
          body: "`.gitignore` only affects files Git isn't tracking yet. If a secret is already committed, ignoring it isn't enough. Run `git rm --cached .env` to stop tracking it, and rotate the secret, because it's still in the history. The *Committed a secret* drill walks through it.",
        },
      ],
    },
  ],
};

export { msgAt };
