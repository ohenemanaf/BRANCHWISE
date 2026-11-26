import type { Lesson } from "./types";
import { clean, committedFile, contains, messages, msgAt, noOp, onBranch, repoOf, tip } from "./checks";
import { conflicting, diverged, started, team } from "./worlds";
import { teammateCommit } from "@/engine/github";
import { ancestors } from "@/engine/repo";
import { mutate, run, script } from "@/engine/run";
import type { World } from "@/engine/types";

export interface Mistake extends Lesson {
  /** What you see when it happens, in the learner's words. */
  symptom: string;
  /** Has the mistake already left your computer? */
  scope: "local" | "pushed";
}

/** Build a mistake drill: the story, the animated recovery, then the learner does it on a fresh copy. */
function drill(m: {
  slug: string;
  title: string;
  symptom: string;
  scope: "local" | "pushed";
  summary: string;
  start: () => World;
  story: string;
  watch: { body: string; commands: string[] };
  why: string;
  goal: string;
  check: (w: World) => boolean;
  hint: string;
  cheats: string[];
  minutes?: number;
}): Mistake {
  return {
    slug: m.slug,
    title: m.title,
    symptom: m.symptom,
    scope: m.scope,
    summary: m.summary,
    minutes: m.minutes ?? 4,
    start: m.start,
    cheats: m.cheats,
    steps: [
      { kind: "read", title: "What happened", body: m.story },
      { kind: "watch", title: "The recovery", body: m.watch.body, commands: m.watch.commands, start: m.start },
      { kind: "read", title: "Why this works", body: m.why },
      { kind: "try", title: "Your turn", body: "The scene has been reset to just after the mistake. Fix it yourself. Use the commands from the recovery, or your own way if you know one.", goal: m.goal, check: m.check, hint: m.hint, answer: m.watch.commands, start: m.start },
    ],
  };
}

const wrongBranch = () => script(started(), ['echo "dark mode" > theme.txt', "git add theme.txt", 'git commit -m "Add dark mode"']);

const badPushed = () => script(team(), ['echo "export const add = (a, b) => { throw new Error() };" > app.js', 'git commit -am "Rewrite add()"', "git push"]);

const lostByReset = () => script(started(), ['echo "syrup" > toppings.txt', "git add .", 'git commit -m "Add toppings"', "git reset --hard HEAD~1"]);

const detachedWork = () =>
  script(started(), ["git switch --detach HEAD~1", 'echo "experiment" > idea.txt', "git add .", 'git commit -m "Try an idea"', "git switch main"]);

/** The merge stops with a conflict (a non-zero exit), so run it directly rather than via script(). */
const midConflict = (): World => run(conflicting(), "git merge spicy").world;

const badRebase = () =>
  script(diverged(), ["git switch feature", "git rebase --onto main~2 main~1 feature"]);

const secretCommitted = () => script(started(), ['echo "API_KEY=sk-live-123" > .env', 'echo "uses the key" > api.js', "git add .", 'git commit -m "Add API client"']);

const deletedBranch = () => script(diverged(), ["git switch feature", "git switch main", "git branch -D feature"]);

const typoMessage = () => script(started(), ['echo "crepes" >> recipes.txt', 'git commit -am "Add crepse"']);

const messyPull = () => {
  let w = script(team(), ['echo "Run npm test before pushing." >> CONTRIBUTING.md', 'git commit -am "Mention tests"', "git config pull.rebase false"]);
  w = mutate(w, (d) => void teammateCommit(d, "origin", "main", { "CHANGELOG.md": "# Changelog\n" }, "Start a changelog"));
  return script(w, ["git pull"]);
};

const stagedWrong = () => script(started(), ['echo "my private notes" > notes.txt', 'echo "pancakes\nwaffles\ncrepes" > recipes.txt', "git add ."]);

const rejected = () => {
  const w = script(team(), ['echo "Run npm test before pushing." >> CONTRIBUTING.md', 'git commit -am "Mention tests"']);
  return mutate(w, (d) => void teammateCommit(d, "origin", "main", { "CHANGELOG.md": "# Changelog\n" }, "Start a changelog"));
};

const tipOf = (w: World, ghKey: string, b: string) => w.repos[ghKey].branches[b];

export const MISTAKES: Mistake[] = [
  drill({
    slug: "committed-to-wrong-branch",
    title: "I committed to main instead of a branch",
    symptom: "Your new commit is on main, but it was meant for a feature branch. It isn't pushed yet.",
    scope: "local",
    summary: "Make a branch where you are, then move main back.",
    start: wrongBranch,
    story: "You meant to start a `dark-mode` branch but forgot, and committed *Add dark mode* straight onto `main`. It's only on your computer, so this is a quick fix.",
    watch: { body: "Make the branch **here**, so it keeps the commit. Then move `main` back one commit and switch to the new branch.", commands: ["git branch dark-mode", "git reset --hard HEAD~1", "git switch dark-mode"] },
    why: "A branch is a label. `git branch dark-mode` puts a new label on the commit, so it's safe. `git reset --hard HEAD~1` then moves only the `main` label back. The commit isn't lost because `dark-mode` still points at it.\n\nIf you'd already **pushed** main, don't reset it. Use `git revert` instead (see *I pushed a bad commit*).",
    goal: "main is back where it was, and dark-mode has the commit",
    check: (w) => msgAt(w, "dark-mode") === "Add dark mode" && msgAt(w, "main") === "Add waffles",
    hint: "git branch dark-mode, git reset --hard HEAD~1, git switch dark-mode",
    cheats: ["git-branch", "git-reset-hard", "git-switch"],
  }),
  drill({
    slug: "staged-wrong-file",
    title: "I staged a file I didn't mean to",
    symptom: "git status lists a file under \"Changes to be committed\" that shouldn't be there.",
    scope: "local",
    summary: "Unstage it with git restore --staged. Your edits stay.",
    start: stagedWrong,
    story: "You ran `git add .`, which staged everything, including `notes.txt`, your private scratch file. Nothing is committed yet.",
    watch: { body: "Take just that file out of the staging area, then commit the rest.", commands: ["git restore --staged notes.txt", "git status", 'git commit -m "Add crepes"'] },
    why: "`git restore --staged` only changes the staging area. Your file and its contents stay in the folder, now untracked. To keep it out for good, add it to `.gitignore`.\n\nAlready committed it? `git reset --soft HEAD~1` undoes the commit and keeps everything staged, so you can fix the selection.",
    goal: "The commit has the recipe change but not notes.txt, which still exists",
    check: (w) => (committedFile(w, "recipes.txt") ?? "").includes("crepes") && committedFile(w, "notes.txt") === undefined && repoOf(w).workdir["notes.txt"] !== undefined,
    hint: "git restore --staged notes.txt, then git commit -m \"Add crepes\"",
    cheats: ["git-restore-staged", "git-status", "git-reset-soft"],
  }),
  drill({
    slug: "bad-commit-pushed",
    title: "I pushed a bad commit to a shared branch",
    symptom: "A broken commit is on GitHub's main and teammates may already have pulled it.",
    scope: "pushed",
    summary: "Revert it with a new commit. Don't rewrite shared history.",
    start: badPushed,
    story: "*Rewrite add()* broke `add()`, and you've pushed it to `main` on GitHub. Teammates pull from main, so some may have it already.",
    watch: { body: "`git revert` makes a **new** commit that undoes the bad one. Push that.", commands: ["git revert HEAD --no-edit", "git push"] },
    why: "Once a commit is shared, removing it (`reset` plus `push --force`) rewrites history other people already have, and their next pull goes wrong. A revert adds to history instead of rewriting it, so everyone just pulls the fix.\n\nThe bad commit stays in the log, and that's fine: the log now shows what happened and how it was fixed.",
    goal: "GitHub's main has a revert commit and app.js works again",
    check: (w) => {
      const t = tipOf(w, "origin", "main");
      const c = w.repos.origin.commits[t];
      return c.message.startsWith("Revert") && c.tree["app.js"] === "export const add = (a, b) => a + b;\n";
    },
    hint: "git revert HEAD --no-edit, then git push",
    cheats: ["git-revert", "git-push"],
  }),
  drill({
    slug: "lost-commits-reset",
    title: "git reset --hard ate my commit",
    symptom: "You reset and a commit vanished from the branch.",
    scope: "local",
    summary: "The reflog still has it. Reset back.",
    start: lostByReset,
    story: "You meant to throw away some uncommitted edits, ran `git reset --hard HEAD~1`, and the *Add toppings* commit went with them.",
    watch: { body: "The reflog lists where HEAD has been. The commit before the reset is `HEAD@{1}`.", commands: ["git reflog", "git reset --hard HEAD@{1}"] },
    why: "Commits aren't deleted when no branch points at them. They become *unreachable* (the faded station) and Git keeps them for weeks. The reflog is the list of everywhere HEAD has been, so you can jump back.\n\nUncommitted changes are a different story: `reset --hard` really does destroy those. When in doubt, commit or `git stash` first.",
    goal: "main is back at \"Add toppings\"",
    check: (w) => onBranch(w, "main") && msgAt(w, "main") === "Add toppings",
    hint: "git reflog, then git reset --hard HEAD@{1}",
    cheats: ["git-reflog", "git-reset-hard"],
  }),
  drill({
    slug: "detached-head-work",
    title: "My commits disappeared after a detached HEAD",
    symptom: "You committed while \"detached\", switched back to main, and the commit is gone.",
    scope: "local",
    summary: "Find it in the reflog and put a branch on it.",
    start: detachedWork,
    story: "You checked out an old commit to try something, committed *Try an idea*, then switched back to `main`. Git warned that you were leaving a commit behind. No branch points at it now.",
    watch: { body: "The reflog remembers it. `HEAD@{1}` is where you were just before switching. Give it a branch.", commands: ["git reflog", "git branch idea HEAD@{1}"] },
    why: "When HEAD is detached, new commits are only referenced by HEAD itself. Switching away leaves them with no label. Making a branch at that commit makes it permanent again.\n\nNext time, run `git switch -c <name>` **before** you commit in a detached HEAD.",
    goal: "A branch called idea points at \"Try an idea\"",
    check: (w) => msgAt(w, "idea") === "Try an idea",
    hint: "git reflog, then git branch idea HEAD@{1}",
    cheats: ["git-reflog", "git-branch", "git-switch-c"],
  }),
  drill({
    slug: "merge-conflict-panic",
    title: "I'm stuck in a merge conflict and want out",
    symptom: "git status says \"You have unmerged paths\" and you just want things back how they were.",
    scope: "local",
    summary: "git merge --abort takes you back to before the merge.",
    start: midConflict,
    story: "You merged `spicy` and got a conflict. You'd rather deal with it later, or talk to whoever wrote `spicy` first.",
    watch: { body: "Abort the merge. Everything goes back to how it was before you ran `git merge`.", commands: ["git merge --abort", "git status"] },
    why: "During a conflict Git is in a half-finished state: some files merged, some marked. `--abort` throws away the half-finished merge and restores the commit you started from. The same escape hatch exists for `git rebase --abort` and `git cherry-pick --abort`.\n\nReady to resolve it properly? See the *Merge conflicts* lesson.",
    goal: "No merge in progress, main unchanged and clean",
    check: (w) => noOp(w) && clean(w) && msgAt(w, "main") === "Add syrup to waffles",
    hint: "git merge --abort",
    cheats: ["git-merge-abort", "conflict-markers"],
  }),
  drill({
    slug: "rebase-gone-wrong",
    title: "My rebase went wrong",
    symptom: "After a rebase the branch looks wrong: commits are missing or in the wrong place.",
    scope: "local",
    summary: "ORIG_HEAD (or the reflog) points at the branch before the rebase.",
    start: badRebase,
    story: "You tried a fancy `git rebase --onto` and dropped a commit by mistake. `feature` has lost *Describe the project*.",
    watch: { body: "Before every rebase Git saves where you were in `ORIG_HEAD`. Reset back to it.", commands: ["git reset --hard ORIG_HEAD"] },
    why: "A rebase makes new commits and moves the branch label to them. The old commits are still there, unreachable. `ORIG_HEAD` points at the old tip. If you've done other things since, look for `rebase (start)` in `git reflog` and use the entry just before it.",
    goal: "feature has both of its commits again",
    check: (w) => {
      const m = messages(w, "feature", 5);
      return m.includes("Describe the project") && m.includes("Add eggs page");
    },
    hint: "git reset --hard ORIG_HEAD",
    cheats: ["git-reset-hard", "git-reflog", "git-rebase-abort"],
  }),
  drill({
    slug: "committed-secret",
    title: "I committed a secret (not pushed yet)",
    symptom: "An .env file with an API key is in your last commit.",
    scope: "local",
    summary: "Untrack it, ignore it and amend the commit before anything leaves your machine.",
    start: secretCommitted,
    story: "*Add API client* includes `.env` with a live API key. You haven't pushed. Good: you can fix the commit itself.",
    watch: {
      body: "Stop tracking `.env` (the file stays on disk), ignore it, and rewrite the last commit without it.",
      commands: ["git rm --cached .env", 'echo ".env" > .gitignore', "git add .gitignore", "git commit --amend --no-edit"],
    },
    why: "`--amend` replaces the last commit with a new one, and the faded station on the graph is the old commit. Nothing outside your computer ever saw it.\n\n**Already pushed?** Treat the key as leaked: revoke it and make a new one right away. Removing it from history afterwards takes tools like `git filter-repo`, and copies may already exist.",
    goal: "No commit on main contains .env, and .gitignore ignores it",
    check: (w) => {
      const r = repoOf(w);
      const main = tip(w, "main");
      if (!main) return false;
      const reach = [...ancestors(r, main)];
      return reach.every((id) => r.commits[id].tree[".env"] === undefined) && (committedFile(w, ".gitignore") ?? "").includes(".env");
    },
    hint: 'git rm --cached .env, echo ".env" > .gitignore, git add .gitignore, git commit --amend --no-edit',
    cheats: ["git-rm-cached", "gitignore", "git-commit-amend"],
  }),
  drill({
    slug: "push-rejected",
    title: "My push was rejected",
    symptom: "\"! [rejected] main -> main (fetch first)\"",
    scope: "local",
    summary: "Someone pushed first. Pull with rebase, then push. Don't force.",
    start: rejected,
    story: "You committed *Mention tests* and pushed, but GitHub refused. A teammate pushed *Start a changelog* first.",
    watch: { body: "Get their commit, replay yours on top, push again.", commands: ["git pull --rebase", "git push"] },
    why: "Git only accepts a push that **adds** to the branch on GitHub. Your main didn't contain the teammate's commit, so pushing would have dropped it. After `pull --rebase` your commit sits on top of theirs and the push is a plain addition.\n\n`git push --force` would have deleted the teammate's commit from GitHub. If you ever really need to force, use `--force-with-lease`, which refuses when the branch has commits you haven't seen.",
    goal: "GitHub has both commits, yours last",
    check: (w) => {
      const r = w.repos.origin;
      const t = r.branches.main;
      return r.commits[t].message === "Mention tests" && contains({ ...w, cwd: "origin" }, Object.values(r.commits).find((c) => c.message === "Start a changelog")?.id, t);
    },
    hint: "git pull --rebase, then git push",
    cheats: ["git-pull-rebase", "git-push", "git-push-force-with-lease"],
  }),
  drill({
    slug: "deleted-branch",
    title: "I deleted a branch with unmerged work",
    symptom: "You ran git branch -D and the branch's commits are gone from the graph.",
    scope: "local",
    summary: "Find its last commit in the reflog and recreate the branch.",
    start: deletedBranch,
    story: "Cleaning up, you ran `git branch -D feature`. It had two commits that were never merged.",
    watch: { body: "You had `feature` checked out a moment ago, so HEAD's reflog remembers its last commit. Recreate the branch there.", commands: ["git reflog", "git branch feature HEAD@{1}"] },
    why: "Deleting a branch deletes the label, not the commits. As long as the reflog has a line for the tip, `git branch <name> <id>` brings it back.\n\nPlain `-d` would have refused, because the branch wasn't merged. `-D` skips that check, so use it carefully.",
    goal: "feature is back with both of its commits",
    check: (w) => {
      const m = messages(w, "feature", 4);
      return m.includes("Add eggs page") && m.includes("Describe the project");
    },
    hint: "git reflog, then git branch feature HEAD@{1}",
    cheats: ["git-reflog", "git-branch", "git-branch-d"],
  }),
  drill({
    slug: "typo-in-commit-message",
    title: "Typo in my last commit message",
    symptom: "Your last commit says \"Add crepse\". Not pushed yet.",
    scope: "local",
    summary: "git commit --amend -m rewrites the last message.",
    start: typoMessage,
    story: "You committed *Add crepse*. It's the latest commit and only on your computer.",
    watch: { body: "Amend replaces the last commit with a corrected one.", commands: ['git commit --amend -m "Add crepes"'] },
    why: "`--amend` makes a new commit with the same parent and swaps the branch over to it. The old one fades out. Don't amend commits you've already pushed: same rule as rebase.\n\nFor older commits, use `git rebase -i` and **reword**.",
    goal: "The last commit is called \"Add crepes\"",
    check: (w) => msgAt(w, "HEAD") === "Add crepes" && messages(w, "HEAD", 5).filter((m) => m.startsWith("Add crep")).length === 1,
    hint: 'git commit --amend -m "Add crepes"',
    cheats: ["git-commit-amend", "git-rebase-i"],
  }),
  drill({
    slug: "pull-made-a-merge",
    title: "git pull made an ugly merge commit",
    symptom: "A \"Merge branch 'main' of github.com/…\" commit appeared after pulling.",
    scope: "local",
    summary: "Undo the pull's merge with ORIG_HEAD, then pull with --rebase.",
    start: messyPull,
    story: "With `pull.rebase` set to false, `git pull` merged sam's commit into yours and made a merge commit. Nothing's wrong with it, but you prefer a straight history and haven't pushed yet.",
    watch: { body: "Undo the merge, then pull again with rebase.", commands: ["git reset --hard ORIG_HEAD", "git pull --rebase"] },
    why: "`git merge` (and so `git pull`) saves your old tip in `ORIG_HEAD`, so `reset --hard ORIG_HEAD` puts main back to just before the pull. `--rebase` then puts your commit on top of sam's instead.\n\nTo make this the default: `git config pull.rebase true`.",
    goal: "main is linear: your commit directly on top of sam's",
    check: (w) => {
      const r = repoOf(w);
      const t = tip(w, "main");
      return !!t && r.commits[t].parents.length === 1 && messages(w, "main", 2).join("|") === "Mention tests|Start a changelog";
    },
    hint: "git reset --hard ORIG_HEAD, then git pull --rebase",
    cheats: ["git-pull-rebase", "git-reset-hard"],
  }),
];

export const mistakeBySlug = (slug: string) => MISTAKES.find((m) => m.slug === slug);
