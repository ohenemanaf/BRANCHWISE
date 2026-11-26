import type { Module } from "../types";
import { clean, committedFile, contains, isMerge, noOp, onBranch, repoOf, tip } from "../checks";
import { conflicting, diverged, started } from "../worlds";
import { mergeBase } from "@/engine/repo";

export const branching: Module = {
  slug: "branching",
  title: "Branching and merging",
  summary: "Branches are moving labels. Learn to make them, switch between them, merge them and rebase them.",
  lessons: [
    {
      slug: "branches-are-labels",
      title: "A branch is just a label",
      summary: "Making a branch costs nothing: it's a name pointing at a commit.",
      minutes: 5,
      start: started,
      cheats: ["git-branch", "git-switch-c", "git-switch"],
      steps: [
        {
          kind: "read",
          title: "Labels, not copies",
          body: "A branch isn't a copy of your project. It's a **label pointing at one commit**. When you commit, the label you're on moves forward to the new commit, and the others stay put.\n\n`HEAD → main` means \"you're on main\". HEAD tells Git which label to move when you commit.",
        },
        {
          kind: "watch",
          title: "Make a branch",
          body: "`git switch -c idea` creates the label `idea` on your current commit and switches to it. Nothing else changes: both labels sit on the same station.",
          commands: ["git switch -c idea", "git branch"],
        },
        {
          kind: "try",
          title: "Work on the branch",
          body: "Make a commit on `idea`. Add a file such as `echo \"bacon\" > sides.txt`. Watch which label moves.",
          goal: "idea has a new commit; main hasn't moved",
          check: (w) => onBranch(w, "idea") && !!tip(w, "idea") && tip(w, "idea") !== tip(w, "main") && contains(w, tip(w, "main"), tip(w, "idea")),
          hint: "echo \"bacon\" > sides.txt, then git add sides.txt and git commit -m \"Add sides\"",
          answer: ['echo "bacon" > sides.txt', "git add sides.txt", 'git commit -m "Add sides"'],
        },
        {
          kind: "try",
          title: "Go back to main",
          body: "Switch back to `main`. Look in the Files panel: `sides.txt` disappears, because main's snapshot never had it. Switching branches swaps the files in your folder to match.",
          goal: "You're on main and sides.txt is gone from the folder",
          check: (w) => onBranch(w, "main") && repoOf(w).workdir["sides.txt"] === undefined,
          hint: "git switch main",
          answer: ["git switch main"],
        },
      ],
    },
    {
      slug: "detached-head",
      title: "Visiting old commits",
      summary: "Check out any commit, and why Git calls that a detached HEAD.",
      minutes: 5,
      start: started,
      cheats: ["git-checkout-commit", "git-switch-detach", "git-switch"],
      mistakes: ["detached-head-work"],
      steps: [
        {
          kind: "read",
          title: "HEAD without a branch",
          body: "Usually HEAD points at a branch, and the branch points at a commit. You can also point HEAD **straight at a commit** to see the project as it was. Git calls this a *detached HEAD*.\n\nIt's safe for looking around. If you commit while detached, no branch remembers those commits, and they're easy to lose.",
        },
        {
          kind: "try",
          title: "Visit the first commit",
          body: "Check out the first commit. Use `git switch --detach HEAD~2`, or `git checkout` with its ID (click the station to paste it). Read the warning Git prints, then look at `recipes.txt`: it doesn't exist yet in that snapshot.",
          goal: "HEAD is detached at the root commit",
          check: (w) => {
            const r = repoOf(w);
            return r.head.kind === "detached" && r.commits[r.head.id].parents.length === 0;
          },
          hint: "git switch --detach HEAD~2",
          answer: ["git switch --detach HEAD~2"],
        },
        {
          kind: "try",
          title: "Come back",
          body: "Return to `main`. `git switch -` (dash) goes back to the branch you were on before.",
          goal: "Back on main",
          check: (w) => onBranch(w, "main"),
          hint: "git switch main (or git switch -)",
          answer: ["git switch main"],
        },
      ],
    },
    {
      slug: "merging",
      title: "Merging",
      summary: "Fast-forward merges and real merge commits, and when you get which.",
      minutes: 7,
      start: diverged,
      cheats: ["git-merge", "git-merge-no-ff", "git-log-graph"],
      steps: [
        {
          kind: "read",
          title: "Two kinds of merge",
          body: "`git merge feature` brings feature's commits into the branch you're on.\n\n- If your branch hasn't moved since feature split off, Git just slides your label forward to feature's commit. That's a **fast-forward**, and no new commit is made.\n- If both branches have new commits (like here: `main` got *Add crepes* while `feature` got two commits), Git makes a **merge commit** with two parents. The two lines join again.",
        },
        {
          kind: "try",
          title: "Merge feature into main",
          body: "You're on `main`. Merge `feature` into it. Git combines changes to different files on its own.",
          goal: "main has a merge commit that includes feature",
          check: (w) => onBranch(w, "main") && isMerge(w, "main") && contains(w, tip(w, "feature"), tip(w, "main")),
          hint: "git merge feature",
          answer: ["git merge feature"],
        },
        {
          kind: "watch",
          title: "And a fast-forward",
          body: "Now `feature` is behind `main`, because main contains everything feature has. Merging main *into* feature is a fast-forward: no new commit, the label just moves.",
          commands: ["git switch feature", "git merge main", "git switch main"],
        },
        {
          kind: "read",
          title: "Clean up",
          body: "Once a branch is merged you can delete its label with `git branch -d feature`. The commits stay, because main contains them. Git refuses `-d` for a branch that isn't merged yet, so you can't lose work by accident.",
        },
      ],
    },
    {
      slug: "merge-conflicts",
      title: "Merge conflicts",
      summary: "When both branches change the same line, you decide what the result is.",
      minutes: 8,
      start: conflicting,
      cheats: ["git-merge", "conflict-markers", "git-merge-abort", "git-checkout-ours-theirs"],
      mistakes: ["merge-conflict-panic"],
      steps: [
        {
          kind: "read",
          title: "Why conflicts happen",
          body: "`main` changed line 2 of `recipes.txt` to *waffles with syrup*. The `spicy` branch changed the same line to *waffles with chili*. Git can merge changes to different lines on its own, but it won't guess between two versions of the same line. So it stops and asks you.\n\nA conflict isn't an error. Nothing is broken, and `git merge --abort` puts everything back.",
        },
        {
          kind: "try",
          title: "Start the merge",
          body: "Merge `spicy` into `main`. Then open `recipes.txt` in the Files panel and look at the markers:\n\n- `<<<<<<< HEAD`: your side starts\n- `=======`: their side starts\n- `>>>>>>> spicy`: the end",
          goal: "A merge is in progress with a conflict in recipes.txt",
          check: (w) => repoOf(w).op?.kind === "merge" && repoOf(w).op!.unmerged.includes("recipes.txt"),
          hint: "git merge spicy",
          answer: ["git merge spicy"],
        },
        {
          kind: "try",
          title: "Resolve it",
          body: "Edit `recipes.txt` so it says what you actually want, for example `waffles with syrup and chili`. Delete all three marker lines. Then mark it resolved with `git add recipes.txt` and finish with `git commit` (Git already has a message ready).",
          goal: "Merge committed, no conflict markers left",
          check: (w) => noOp(w) && clean(w) && !(committedFile(w, "recipes.txt") ?? "<<<").includes("<<<<<<<") && repoOf(w).commits[repoOf(w).branches.main].parents.length === 2,
          hint: "Use the Files panel, or: echo \"pancakes\" > recipes.txt, echo \"waffles with syrup and chili\" >> recipes.txt, git add recipes.txt, git commit",
          answer: ['echo "pancakes" > recipes.txt', 'echo "waffles with syrup and chili" >> recipes.txt', "git add recipes.txt", "git commit"],
        },
      ],
    },
    {
      slug: "rebase-basics",
      title: "Rebasing",
      summary: "Replay your commits on top of the latest main, and the one rule for doing it safely.",
      minutes: 8,
      start: diverged,
      cheats: ["git-rebase", "git-rebase-continue", "git-rebase-abort"],
      mistakes: ["rebase-gone-wrong"],
      steps: [
        {
          kind: "read",
          title: "Another way to catch up",
          body: "Merging keeps history as it happened: two lines joined by a merge commit. **Rebasing** rewrites your branch instead. It takes your commits and replays them, one at a time, on top of another branch, so history becomes one straight line.\n\nThe replayed commits are **new commits** with new IDs. The originals don't disappear straight away. Keep *Show unreachable commits* on and you'll see them fade out.",
        },
        {
          kind: "try",
          title: "Rebase feature onto main",
          body: "Switch to `feature` and rebase it onto `main`. Afterwards `feature` should sit directly on top of *Add crepes*.",
          goal: "feature is rebased: main's tip is in feature's history and the history is linear",
          check: (w) => {
            const r = repoOf(w);
            const f = tip(w, "feature");
            const m = tip(w, "main");
            if (!f || !m) return false;
            return mergeBase(r, f, m) === m && r.commits[f].parents.length === 1 && f !== m;
          },
          hint: "git switch feature, then git rebase main",
          answer: ["git switch feature", "git rebase main"],
        },
        {
          kind: "try",
          title: "Now it's a fast-forward",
          body: "Switch to `main` and merge `feature`. Because feature now sits on top of main, this is a fast-forward and history stays a straight line.",
          goal: "main and feature point at the same commit",
          check: (w) => !!tip(w, "main") && tip(w, "main") === tip(w, "feature"),
          hint: "git switch main, then git merge feature",
          answer: ["git switch main", "git merge feature"],
        },
        {
          kind: "read",
          title: "The golden rule",
          body: "**Don't rebase commits other people already have.** If you've pushed a branch and a teammate built on it, rebasing swaps those commits for new ones. Their copy and yours then disagree, and someone has to force-push.\n\nRebase your own local work freely. For shared branches, merge.",
        },
      ],
    },
  ],
};

export { committedFile };
