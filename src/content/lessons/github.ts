import type { Module } from "../types";
import { contains, messages, repoOf, tip } from "../checks";
import { openSource, started, team } from "../worlds";
import { teammateCommit, teammateReview } from "@/engine/github";
import { mutate, script } from "@/engine/run";
import type { World } from "@/engine/types";

const teamWithPr = (): World =>
  script(team(), [
    "git switch -c add-subtract",
    'echo "export const subtract = (a, b) => a - b;" >> app.js',
    'git commit -am "Add subtract()"',
    "git push -u origin add-subtract",
    'gh pr create --title "Add subtract()" --body "Adds a subtract helper."',
  ]);

const teammatePushed = (w: World, file = "CHANGELOG.md", msg = "Start a changelog") =>
  mutate(w, (d) => void teammateCommit(d, "origin", "main", { [file]: "# Changelog\n" }, msg));

export const github: Module = {
  slug: "github-flow",
  title: "Collaborating on GitHub",
  summary: "Remotes, pushing and pulling, pull requests, reviews, merge buttons and forks.",
  lessons: [
    {
      slug: "remotes",
      title: "Remotes: your repo and GitHub's",
      summary: "origin, origin/main, and why your laptop doesn't see new work until you fetch.",
      minutes: 7,
      start: team,
      cheats: ["git-clone", "git-remote-v", "git-fetch", "git-pull", "remote-tracking-branch"],
      steps: [
        {
          kind: "read",
          title: "Two copies of the same project",
          body: "You cloned `you/project` from GitHub. Now there are **two repositories**: the one on GitHub (top strip) and the one on your computer (bottom strip). They share commits, but each has its own labels.\n\nThe dashed `origin/main` label is a **remote-tracking branch**. It's your computer's *memory* of where `main` was on GitHub the last time you checked. It only moves when you talk to GitHub.",
        },
        {
          kind: "try",
          title: "A teammate pushed",
          body: "Your teammate sam just pushed a commit to GitHub. Look at the top strip. Your computer hasn't noticed: `origin/main` still sits on the old commit.\n\nRun `git fetch`. It downloads new commits and moves `origin/main`. It never touches your own branches or files.",
          goal: "origin/main on your computer matches GitHub",
          check: (w) => repoOf(w).remoteRefs.origin?.main === w.repos.origin.branches.main,
          hint: "git fetch",
          answer: ["git fetch"],
          enter: { note: "sam pushed a commit to main on GitHub.", apply: (w) => teammatePushed(w) },
        },
        {
          kind: "try",
          title: "Catch up",
          body: "`git status` now says your branch is *behind*. Bring `main` up to `origin/main`, either with `git merge origin/main` or with `git pull`, which is fetch and merge in one step.",
          goal: "Your main has sam's commit",
          check: (w) => tip(w, "main") === w.repos.origin.branches.main,
          hint: "git pull (or git merge origin/main)",
          answer: ["git pull"],
        },
      ],
    },
    {
      slug: "publish",
      title: "Publish a project to GitHub",
      summary: "Create the GitHub repo, connect it as origin and push with upstream tracking.",
      minutes: 5,
      start: started,
      cheats: ["gh-repo-create", "git-remote-add", "git-push-u"],
      steps: [
        {
          kind: "read",
          title: "From laptop to GitHub",
          body: "This project only exists on your computer. Publishing it takes three things:\n\n- an empty repository on GitHub\n- a **remote** called `origin` that points at it\n- a push of `main` with `-u`, so Git remembers that local `main` goes with `origin/main` (that link is called *upstream tracking*)\n\nThe GitHub CLI does all three: `gh repo create recipe-box --public --source=. --push`. Doing it by hand also works: create the repo on github.com, then `git remote add origin <url>` and `git push -u origin main`.",
        },
        {
          kind: "try",
          title: "Publish it",
          body: "Publish this project as `recipe-box`.",
          goal: "GitHub's main matches yours, and main tracks origin/main",
          check: (w) => !!w.repos.origin && w.repos.origin.branches.main === tip(w, "main") && repoOf(w).upstream.main?.remote === "origin",
          hint: "gh repo create recipe-box --public --source=. --push",
          answer: ["gh repo create recipe-box --public --source=. --push"],
        },
        {
          kind: "read",
          title: "From now on",
          body: "Because of `-u`, a plain `git push` and `git pull` know where to go. `git status` also tells you whether you're ahead of GitHub or behind it.",
        },
      ],
    },
    {
      slug: "pull-requests",
      title: "Open a pull request",
      summary: "Branch, commit, push and ask for a review: the everyday GitHub flow.",
      minutes: 7,
      start: team,
      cheats: ["git-switch-c", "git-push-u", "gh-pr-create", "github-flow"],
      steps: [
        {
          kind: "read",
          title: "The GitHub flow",
          body: "Teams rarely commit straight to `main`. The usual loop is:\n\n- make a branch for one change\n- commit to it\n- push the branch to GitHub\n- open a **pull request** (PR) asking to merge it into main\n- a teammate reviews, then it's merged\n\nA PR is a page on GitHub for discussing a branch before it lands. It isn't a Git command, which is why we use `gh`, GitHub's CLI.",
        },
        {
          kind: "try",
          title: "Your turn",
          body: "Create a branch `add-multiply`. Add a line to `app.js` such as `echo \"export const multiply = (a, b) => a * b;\" >> app.js`, commit it, push the branch with `-u`, and open a PR with `gh pr create --fill`. `--fill` uses your commit message as the title.",
          goal: "An open pull request from add-multiply into main",
          check: (w) => w.github.prs.some((p) => p.state === "open" && p.head === "add-multiply" && p.base === "main"),
          hint: "git switch -c add-multiply, edit app.js, git commit -am \"Add multiply()\", git push -u origin add-multiply, gh pr create --fill",
          answer: ["git switch -c add-multiply", 'echo "export const multiply = (a, b) => a * b;" >> app.js', 'git commit -am "Add multiply()"', "git push -u origin add-multiply", "gh pr create --fill"],
        },
        {
          kind: "read",
          title: "What's on GitHub now",
          body: "Open the GitHub tab on the right. Your PR shows its review status, its checks and whether it can be merged. Next lesson: getting it reviewed and merged.",
        },
      ],
    },
    {
      slug: "review-and-merge",
      title: "Reviews and the merge button",
      summary: "Respond to review comments, then pick merge, squash or rebase.",
      minutes: 8,
      start: teamWithPr,
      cheats: ["gh-pr-merge", "merge-methods", "gh-pr-review", "git-pull"],
      steps: [
        {
          kind: "read",
          title: "A PR is waiting",
          body: "You've opened PR #1, *Add subtract()*. You can't approve your own PR on GitHub. Try `gh pr review 1 --approve` and read the error. Someone else has to review it.",
        },
        {
          kind: "try",
          title: "Respond to feedback",
          body: "sam requested changes: *\"Could you add a test for this?\"*. You don't open a new PR. Just commit to the same branch and push. The PR updates automatically.\n\nAdd a file `app.test.js` (any content), commit it on `add-subtract`, and push.",
          goal: "The PR's branch on GitHub contains app.test.js",
          check: (w) => {
            const t = w.repos.origin.branches["add-subtract"];
            return !!t && w.repos.origin.commits[t].tree["app.test.js"] !== undefined;
          },
          hint: 'echo "test(subtract)" > app.test.js, git add app.test.js, git commit -m "Test subtract()", git push',
          answer: ['echo "test(subtract)" > app.test.js', "git add app.test.js", 'git commit -m "Test subtract()"', "git push"],
          enter: { note: "sam reviewed PR #1 and requested changes.", apply: (w) => mutate(w, (d) => teammateReview(d, 1, "changes_requested")) },
        },
        {
          kind: "read",
          title: "Three merge buttons",
          body: "GitHub merges a PR in one of three ways:\n\n- **Merge commit**: keeps every commit and adds a merge commit. Full history.\n- **Squash and merge**: squashes the whole PR into **one** new commit on main. Tidy history, one commit per PR.\n- **Rebase and merge**: replays each commit onto main, with no merge commit.\n\nAll three get the same files into main. They differ in what the history looks like.",
        },
        {
          kind: "try",
          title: "Squash and merge",
          body: "sam approved. Squash-merge PR #1 and delete its branch: `gh pr merge 1 --squash --delete-branch`, or use the button in the GitHub tab.",
          goal: "PR #1 is merged with squash",
          check: (w) => w.github.prs[0]?.state === "merged" && w.github.prs[0]?.method === "squash",
          hint: "gh pr merge 1 --squash --delete-branch",
          answer: ["gh pr merge 1 --squash --delete-branch"],
          enter: { note: "sam approved PR #1.", apply: (w) => mutate(w, (d) => teammateReview(d, 1, "approved")) },
        },
        {
          kind: "try",
          title: "Bring the merge home",
          body: "The merge happened **on GitHub**. Your local `main` doesn't have it yet. Look at the two strips. Pull it.",
          goal: "Your main matches GitHub's main",
          check: (w) => tip(w, "main") === w.repos.origin.branches.main,
          hint: "git switch main (if needed), then git pull",
          answer: ["git switch main", "git pull"],
        },
      ],
    },
    {
      slug: "rejected-push",
      title: "When your push is rejected",
      summary: "Someone pushed first. Integrate their work, then push again (no force needed).",
      minutes: 6,
      start: () => teammatePushed(script(team(), ['echo "Run npm test before pushing." >> CONTRIBUTING.md', 'git commit -am "Mention tests"'])),
      cheats: ["git-pull-rebase", "git-push", "git-fetch"],
      mistakes: ["push-rejected"],
      steps: [
        {
          kind: "watch",
          title: "Push",
          body: "You committed *Mention tests* on main. Watch what happens when you push it.",
          commands: ["git push"],
          failing: ["git push"],
        },
        {
          kind: "read",
          title: "Why Git said no",
          body: "While you worked, sam pushed *Start a changelog* to GitHub. Pushing your commit would replace sam's, so Git refuses. That's the *fetch first* rejection.\n\nThe fix is to **integrate first**: get sam's commit, put yours on top, then push. `git pull --rebase` does exactly that. It replays your local commit on top of what's on GitHub and keeps history in a straight line.\n\nDon't reach for `--force` here. It would delete sam's commit from GitHub.",
        },
        {
          kind: "try",
          title: "Integrate and push",
          body: "Run `git pull --rebase`, then `git push`.",
          goal: "GitHub's main has both commits, yours on top",
          check: (w) => {
            const m = messages({ ...w, cwd: "origin", repos: { ...w.repos, origin: { ...w.repos.origin, head: { kind: "branch", name: "main" } } } }, "main", 3);
            return m[0] === "Mention tests" && m.includes("Start a changelog");
          },
          hint: "git pull --rebase, then git push",
          answer: ["git pull --rebase", "git push"],
        },
      ],
    },
    {
      slug: "forks",
      title: "Contributing with a fork",
      summary: "Fork a project you can't push to, send a PR upstream, and keep your fork in sync.",
      minutes: 9,
      start: openSource,
      cheats: ["gh-repo-fork", "git-remote-v", "upstream-remote", "gh-pr-create"],
      steps: [
        {
          kind: "read",
          title: "You can't push to their repo",
          body: "`acme/recipes` belongs to someone else, so you can't push branches to it. Open source works through a **fork**: your own copy of the repository on GitHub. You push there, then open a PR from your fork back to the original.\n\nBy convention your fork is the `origin` remote and the original is the `upstream` remote.",
        },
        {
          kind: "try",
          title: "Fork and clone",
          body: "Run `gh repo fork acme/recipes --clone`. It forks on GitHub, clones your fork, and adds `upstream` for you. Then check with `git remote -v`.",
          goal: "origin is your fork and upstream is acme/recipes",
          check: (w) => repoOf(w).initialized && /you\/recipes/.test(repoOf(w).remotes.origin ?? "") && /acme\/recipes/.test(repoOf(w).remotes.upstream ?? ""),
          hint: "gh repo fork acme/recipes --clone",
          answer: ["gh repo fork acme/recipes --clone"],
        },
        {
          kind: "try",
          title: "Send a contribution",
          body: "Make a branch `add-crepes`, add `recipes/crepes.md`, commit, push it to **your fork** (`origin`) and open a PR. `gh pr create` targets the original repo automatically.",
          goal: "An open PR into acme/recipes from your fork",
          check: (w) => w.github.prs.some((p) => p.state === "open" && p.repo === "upstream" && p.headRepo === "origin"),
          hint: 'git switch -c add-crepes, echo "# Crepes" > recipes/crepes.md, git add ., git commit -m "Add crepes", git push -u origin add-crepes, gh pr create --fill',
          answer: ["git switch -c add-crepes", 'echo "# Crepes" > recipes/crepes.md', "git add .", 'git commit -m "Add crepes"', "git push -u origin add-crepes", "gh pr create --fill"],
        },
        {
          kind: "try",
          title: "Keep your fork in sync",
          body: "maria merged other work into `acme/recipes`. Your fork doesn't update itself. Bring upstream's main into your main and push it to your fork:\n\n`git switch main`, `git fetch upstream`, `git merge upstream/main`, `git push origin main`.",
          goal: "Your fork's main includes the latest upstream main",
          check: (w) => contains({ ...w, cwd: "origin" }, w.repos.upstream.branches.main, w.repos.origin.branches.main),
          hint: "git switch main, git fetch upstream, git merge upstream/main, git push origin main",
          answer: ["git switch main", "git fetch upstream", "git merge upstream/main", "git push origin main"],
          enter: { note: "maria pushed a new recipe to acme/recipes main.", apply: (w) => mutate(w, (d) => void teammateCommit(d, "upstream", "main", { "recipes/omelette.md": "# Omelette\n" }, "Add omelette", "maria")) },
        },
      ],
    },
  ],
};
