/**
 * The cheat-code reference. `title` is phrased as the thing you want to do, so search works
 * in plain language ("undo last commit") as well as by command.
 */

export type Danger = "safe" | "careful" | "rewrites" | "destroys";

export interface Cheat {
  slug: string;
  command: string;
  title: string;
  summary: string;
  example?: string;
  /** What happens on the commit graph. */
  graph?: string;
  danger: Danger;
  group: Group;
  /** Extra search words. */
  tags?: string;
  /** false = real Git, not simulated in the sandbox. */
  simulated?: boolean;
  /** Sandbox preset to try it in. */
  preset?: string;
}

export type Group = "Start" | "Save changes" | "Look around" | "Branches" | "Merge & rebase" | "Undo" | "Remotes" | "GitHub" | "Investigate" | "Internals" | "Concepts";

export const GROUPS: Group[] = ["Start", "Save changes", "Look around", "Branches", "Merge & rebase", "Undo", "Remotes", "GitHub", "Investigate", "Internals", "Concepts"];

export const DANGER_LABEL: Record<Danger, string> = {
  safe: "Safe",
  careful: "Careful",
  rewrites: "Rewrites history",
  destroys: "Can destroy work",
};

export const CHEATS: Cheat[] = [
  // ---------- Start ----------
  { slug: "git-init", command: "git init", title: "Start tracking a folder with Git", summary: "Creates a hidden .git folder. Your files stay as they are, untracked until you add them.", example: "git init", danger: "safe", group: "Start", preset: "blank", tags: "new repository create" },
  { slug: "git-clone", command: "git clone <url>", title: "Download a repository", summary: "Copies a repository (all its history) to your computer, sets up the origin remote and checks out the default branch.", example: "git clone https://github.com/you/project.git", graph: "Copies every commit; adds origin/* labels.", danger: "safe", group: "Start", tags: "download copy" },
  { slug: "git-config-user", command: "git config --global user.name", title: "Set your name and email", summary: "Every commit records an author. Set it once per computer.", example: 'git config --global user.name "Ada Lovelace"\ngit config --global user.email ada@example.com', danger: "safe", group: "Start", tags: "author identity setup" },
  { slug: "gitignore", command: ".gitignore", title: "Ignore files (secrets, node_modules, logs)", summary: "A file listing patterns Git should not track. Only affects untracked files: already-committed files need git rm --cached.", example: ".env\n*.log\nnode_modules/", danger: "safe", group: "Start", tags: "ignore exclude env secret" },

  // ---------- Save changes ----------
  { slug: "git-status", command: "git status", title: "See what's changed", summary: "Shows your branch, what's staged, what's modified but not staged, and untracked files. Run it all the time.", example: "git status\ngit status -s   # short form", danger: "safe", group: "Save changes", tags: "changes modified" },
  { slug: "git-status-short", command: "git status -s", title: "Compact status", summary: "Two-letter codes: left column = staged, right = unstaged. ?? = untracked, UU = conflict.", danger: "safe", group: "Save changes" },
  { slug: "git-add", command: "git add <file>", title: "Stage a file for the next commit", summary: "Copies the file's current contents into the staging area. Edit it again later and you need to add again.", example: "git add README.md\ngit add src/      # a folder\ngit add .         # everything here", danger: "safe", group: "Save changes", tags: "stage index" },
  { slug: "git-add-all", command: "git add -A", title: "Stage everything, including deletions", summary: "Stages new, modified and deleted files across the whole repo. Check git status first so nothing private sneaks in.", danger: "careful", group: "Save changes" },
  { slug: "git-commit", command: 'git commit -m "message"', title: "Save a snapshot", summary: "Records the staged files as a new commit on the current branch. Write messages that say what the change does.", example: 'git commit -m "Add search box"', graph: "A new station; the current branch label moves to it.", danger: "safe", group: "Save changes", tags: "save snapshot" },
  { slug: "git-commit-am", command: 'git commit -am "message"', title: "Stage tracked changes and commit in one go", summary: "-a stages modifications to files Git already tracks. New (untracked) files still need git add.", danger: "safe", group: "Save changes" },
  { slug: "git-commit-amend", command: "git commit --amend", title: "Fix the last commit (message or files)", summary: "Replaces the last commit with a new one. Stage extra changes first; use -m for a new message or --no-edit to keep it. Don't amend pushed commits.", example: 'git commit --amend -m "Better message"\ngit commit --amend --no-edit', graph: "The tip is swapped for a new commit; the old one fades.", danger: "rewrites", group: "Save changes", tags: "typo message edit last commit" },
  { slug: "git-rm", command: "git rm <file>", title: "Delete a file and stage the deletion", summary: "Removes the file from your folder and from the next commit.", danger: "careful", group: "Save changes", tags: "delete remove" },
  { slug: "git-rm-cached", command: "git rm --cached <file>", title: "Stop tracking a file but keep it on disk", summary: "Removes the file from Git (next commit) while leaving it in your folder. Pair with .gitignore for secrets and build output.", example: "git rm --cached .env", danger: "safe", group: "Save changes", tags: "untrack secret env" },
  { slug: "git-mv", command: "git mv <old> <new>", title: "Rename or move a file", summary: "Renames the file and stages the rename.", danger: "safe", group: "Save changes", tags: "rename move" },
  { slug: "git-stash", command: "git stash", title: "Put work aside without committing", summary: "Saves your uncommitted changes and gives you a clean working folder. Handy before switching branches or pulling.", example: "git stash\ngit stash -m \"half-done header\"", graph: "A small stash marker hangs off the current commit.", danger: "safe", group: "Save changes", tags: "shelve save later" },
  { slug: "git-stash-pop", command: "git stash pop", title: "Bring stashed work back", summary: "Re-applies the latest stash and removes it from the list (kept if there's a conflict). git stash apply keeps it in the list.", example: "git stash list\ngit stash pop", danger: "safe", group: "Save changes" },
  { slug: "git-stash-u", command: "git stash -u", title: "Stash untracked files too", summary: "Plain git stash leaves new, untracked files alone. -u takes them as well.", danger: "safe", group: "Save changes" },

  // ---------- Look around ----------
  { slug: "git-log", command: "git log", title: "Show commit history", summary: "Lists commits from HEAD backwards, newest first.", example: "git log\ngit log -3\ngit log --author=sam", danger: "safe", group: "Look around", tags: "history" },
  { slug: "git-log-oneline", command: "git log --oneline", title: "History, one line per commit", summary: "Short ID plus message, with branch labels in brackets.", danger: "safe", group: "Look around" },
  { slug: "git-log-graph", command: "git log --oneline --graph --all", title: "History of every branch", summary: "--all includes every branch and remote label, not just the one you're on. (This site draws the graph for you.)", danger: "safe", group: "Look around", tags: "tree all branches" },
  { slug: "git-log-grep", command: 'git log --grep="text"', title: "Find commits by message", summary: "Only shows commits whose message contains the text.", danger: "safe", group: "Look around", tags: "search" },
  { slug: "git-show", command: "git show <commit>", title: "See one commit and its changes", summary: "Author, message and the diff against its parent.", example: "git show HEAD~1", danger: "safe", group: "Look around" },
  { slug: "git-show-file", command: "git show <commit>:<path>", title: "See a file as it was in a commit", summary: "Prints the file's contents from any commit without checking it out.", example: "git show HEAD~3:README.md", danger: "safe", group: "Look around", tags: "old version file" },
  { slug: "git-diff", command: "git diff", title: "See unstaged changes", summary: "Working folder vs staging area. Add two commits to compare those instead.", example: "git diff\ngit diff main feature", danger: "safe", group: "Look around", tags: "changes compare" },
  { slug: "git-diff-staged", command: "git diff --staged", title: "See what you're about to commit", summary: "Staging area vs the last commit.", danger: "safe", group: "Look around" },
  { slug: "revision-syntax", command: "HEAD~2, main^, a1b2c3d", title: "Name any commit", summary: "HEAD~n walks back n first-parents. ^ is one step (^2 = second parent of a merge). A short ID (7+ chars), branch, tag or HEAD@{n} from the reflog all work anywhere a commit is expected.", example: "git show HEAD~2\ngit diff main~3 main", danger: "safe", group: "Look around", tags: "tilde caret ancestor parent" },
  { slug: "git-tag", command: "git tag <name> [commit]", title: "Label a commit permanently (releases)", summary: "Unlike branches, tags don't move. Push them with git push --tags.", example: "git tag v1.0\ngit tag v0.1 HEAD~5", graph: "A grey label that stays put.", danger: "safe", group: "Look around", tags: "release version" },
  { slug: "git-tag-a", command: 'git tag -a v1.0 -m "msg"', title: "Annotated tag with a message", summary: "Stores who tagged it and a message. Preferred for releases.", danger: "safe", group: "Look around" },

  // ---------- Branches ----------
  { slug: "git-branch", command: "git branch <name> [commit]", title: "Create a branch (without switching)", summary: "Puts a new label on a commit (HEAD by default). With no name, lists branches.", example: "git branch\ngit branch hotfix main~2", graph: "A new label appears; nothing else changes.", danger: "safe", group: "Branches", tags: "list new" },
  { slug: "git-switch-c", command: "git switch -c <name>", title: "Create a branch and switch to it", summary: "The everyday way to start new work. Same as git checkout -b <name>.", example: "git switch -c add-search", danger: "safe", group: "Branches", tags: "checkout -b new" },
  { slug: "git-switch", command: "git switch <branch>", title: "Switch branches", summary: "Moves HEAD to the branch and updates your files to match. Uncommitted changes come along if they don't clash.", example: "git switch main\ngit switch -   # previous branch", graph: "HEAD moves to another label.", danger: "safe", group: "Branches", tags: "checkout change" },
  { slug: "git-switch-dash", command: "git switch -", title: "Go back to the previous branch", summary: "Like cd - for branches.", danger: "safe", group: "Branches" },
  { slug: "git-branch-d", command: "git branch -d <name>", title: "Delete a merged branch", summary: "Refuses if the branch has unmerged commits. -D forces it, and you can still recover via the reflog for a while.", example: "git branch -d feature\ngit branch -D experiment", graph: "The label disappears; commits stay if reachable elsewhere.", danger: "careful", group: "Branches", tags: "remove delete" },
  { slug: "git-branch-m", command: "git branch -m <new>", title: "Rename a branch", summary: "Renames the current branch (or -m old new).", example: "git branch -m main", danger: "safe", group: "Branches", tags: "rename" },
  { slug: "git-branch-vv", command: "git branch -vv", title: "See each branch's upstream and ahead/behind", summary: "Shows [origin/main: ahead 1, behind 2] next to each branch.", danger: "safe", group: "Branches", tags: "tracking upstream" },
  { slug: "git-branch-a", command: "git branch -a", title: "List local and remote branches", summary: "Remote-tracking branches show as remotes/origin/…", danger: "safe", group: "Branches" },
  { slug: "git-branch-f", command: "git branch -f <name> <commit>", title: "Move a branch label anywhere", summary: "Points an existing branch at another commit without checking it out. Can orphan commits.", example: "git branch -f experiment HEAD~2", danger: "careful", group: "Branches", tags: "force move pointer" },
  { slug: "git-checkout-commit", command: "git checkout <commit>", title: "Look at an old commit (detached HEAD)", summary: "Puts HEAD directly on a commit. Fine for looking around; make a branch before committing.", example: "git checkout a1b2c3d", danger: "careful", group: "Branches", tags: "detached old version" },
  { slug: "git-switch-detach", command: "git switch --detach <commit>", title: "Detach HEAD on purpose", summary: "The switch-style way to visit a commit.", example: "git switch --detach HEAD~3", danger: "safe", group: "Branches" },
  { slug: "detached-head", command: "detached HEAD", title: "What 'detached HEAD' means", summary: "HEAD points at a commit instead of a branch. New commits there belong to no branch, so switching away leaves them behind. Fix: git switch -c <name> before you leave.", danger: "careful", group: "Concepts", tags: "concept" },

  // ---------- Merge & rebase ----------
  { slug: "git-merge", command: "git merge <branch>", title: "Merge a branch into the current one", summary: "Fast-forwards if possible, otherwise creates a merge commit with two parents.", example: "git switch main\ngit merge feature", graph: "Either the label slides forward, or two lines join at a new commit.", danger: "safe", group: "Merge & rebase", tags: "combine join" },
  { slug: "git-merge-no-ff", command: "git merge --no-ff <branch>", title: "Always make a merge commit", summary: "Keeps a visible merge point even when a fast-forward was possible.", danger: "safe", group: "Merge & rebase" },
  { slug: "git-merge-ff-only", command: "git merge --ff-only <branch>", title: "Merge only if it's a fast-forward", summary: "Refuses instead of creating a merge commit.", danger: "safe", group: "Merge & rebase" },
  { slug: "git-merge-squash", command: "git merge --squash <branch>", title: "Squash a branch into one staged change", summary: "Applies the branch's combined changes to your index without committing. You then commit once.", danger: "safe", group: "Merge & rebase" },
  { slug: "git-merge-abort", command: "git merge --abort", title: "Cancel a merge with conflicts", summary: "Puts everything back to before git merge.", danger: "safe", group: "Merge & rebase", tags: "conflict cancel undo" },
  { slug: "conflict-markers", command: "<<<<<<< ======= >>>>>>>", title: "Resolve a merge conflict", summary: "Edit the file to the version you want, delete the three marker lines, git add the file, then git commit (or git rebase --continue).", example: "<<<<<<< HEAD\nyour line\n=======\ntheir line\n>>>>>>> feature", danger: "safe", group: "Merge & rebase", tags: "conflict resolve", preset: "conflict" },
  { slug: "git-checkout-ours-theirs", command: "git checkout --theirs <file>", title: "Take one side of a conflict wholesale", summary: "--ours keeps your version, --theirs takes theirs. Then git add the file. (git restore --ours/--theirs does the same.)", danger: "careful", group: "Merge & rebase", tags: "conflict" },
  { slug: "git-rebase", command: "git rebase <base>", title: "Replay your branch on top of another", summary: "Copies your commits onto the tip of <base> for a straight history. Creates new commits, so don't rebase shared work.", example: "git switch feature\ngit rebase main", graph: "Your commits reappear (new IDs) on top of base; originals fade.", danger: "rewrites", group: "Merge & rebase", tags: "linear update" },
  { slug: "git-rebase-continue", command: "git rebase --continue", title: "Continue a rebase after fixing conflicts", summary: "Fix the files, git add them, then continue. --skip drops the current commit.", danger: "safe", group: "Merge & rebase" },
  { slug: "git-rebase-skip", command: "git rebase --skip", title: "Skip the commit that conflicted", summary: "Drops that commit from the rebased result.", danger: "careful", group: "Merge & rebase" },
  { slug: "git-rebase-abort", command: "git rebase --abort", title: "Cancel a rebase", summary: "Returns the branch to exactly where it was before.", danger: "safe", group: "Merge & rebase", tags: "undo cancel" },
  { slug: "git-rebase-i", command: "git rebase -i <base>", title: "Squash, reword, reorder or drop commits", summary: "Opens a todo list: pick, reword, squash, fixup, drop. Rewrites history, so use it on unpushed work.", example: "git rebase -i HEAD~3\ngit rebase -i main", danger: "rewrites", group: "Merge & rebase", tags: "interactive squash clean up" },
  { slug: "git-rebase-onto", command: "git rebase --onto <new> <old> <branch>", title: "Move part of a branch to a new base", summary: "Replays commits after <old> onto <new>. Useful when a branch was cut from the wrong place.", danger: "rewrites", group: "Merge & rebase" },
  { slug: "git-cherry-pick", command: "git cherry-pick <commit>", title: "Copy one commit onto the current branch", summary: "Applies that commit's change as a new commit. Good for hotfixes on release branches.", example: "git switch release\ngit cherry-pick a1b2c3d", graph: "A copy (new ID) appears on your branch.", danger: "safe", group: "Merge & rebase", tags: "copy hotfix" },
  { slug: "git-cherry-pick-abort", command: "git cherry-pick --abort", title: "Cancel a cherry-pick", summary: "Also --continue after fixing conflicts, and --skip.", danger: "safe", group: "Merge & rebase" },

  // ---------- Undo ----------
  { slug: "git-restore", command: "git restore <file>", title: "Throw away changes to a file", summary: "Resets the file to the staged (or committed) version. Uncommitted edits are gone for good.", example: "git restore README.md\ngit restore .", danger: "destroys", group: "Undo", tags: "discard revert file checkout --" },
  { slug: "git-restore-staged", command: "git restore --staged <file>", title: "Unstage a file", summary: "Takes the file out of the staging area; your edits stay in the folder.", example: "git restore --staged notes.txt", danger: "safe", group: "Undo", tags: "unstage reset HEAD" },
  { slug: "git-restore-source", command: "git restore --source <commit> <file>", title: "Get an old version of one file back", summary: "Copies the file from any commit into your folder.", example: "git restore --source HEAD~3 config.json", danger: "careful", group: "Undo" },
  { slug: "git-reset-soft", command: "git reset --soft <commit>", title: "Undo commits, keep the changes staged", summary: "Moves the branch back; everything from the undone commits stays staged, ready to recommit. Great for squashing.", example: "git reset --soft HEAD~1", graph: "The label moves back; the commits fade.", danger: "rewrites", group: "Undo", tags: "undo last commit uncommit" },
  { slug: "git-reset-mixed", command: "git reset <commit>", title: "Undo commits, keep the changes unstaged", summary: "The default mode. Moves the branch back and unstages; files keep your edits.", example: "git reset HEAD~1", danger: "rewrites", group: "Undo", tags: "undo last commit" },
  { slug: "git-reset-hard", command: "git reset --hard <commit>", title: "Move the branch back and discard everything after", summary: "Branch, staging area and files all jump to <commit>. Uncommitted work is destroyed; committed work is recoverable via the reflog.", example: "git reset --hard HEAD~1\ngit reset --hard origin/main\ngit reset --hard ORIG_HEAD", graph: "The label jumps; later commits fade.", danger: "destroys", group: "Undo", tags: "undo discard throw away" },
  { slug: "git-reset-file", command: "git reset <file>", title: "Unstage (older syntax)", summary: "Same as git restore --staged <file>.", danger: "safe", group: "Undo" },
  { slug: "git-revert", command: "git revert <commit>", title: "Undo a pushed commit safely", summary: "Makes a new commit that does the opposite. History isn't rewritten, so teammates just pull.", example: "git revert HEAD --no-edit\ngit revert -m 1 <merge-commit>", graph: "A new commit is added on top.", danger: "safe", group: "Undo", tags: "undo pushed" },
  { slug: "git-revert-merge", command: "git revert -m 1 <merge>", title: "Undo a merge commit", summary: "-m 1 says 'keep the first parent's side' (usually main).", danger: "careful", group: "Undo" },
  { slug: "git-reflog", command: "git reflog", title: "Find lost commits", summary: "Every place HEAD has been, newest first. Use an entry (HEAD@{2}) with reset, branch or switch to recover. Local only; expires after ~90 days.", example: "git reflog\ngit branch rescued HEAD@{3}", danger: "safe", group: "Undo", tags: "recover lost deleted history undo" },
  { slug: "orig-head", command: "ORIG_HEAD", title: "Undo the last merge, rebase or reset", summary: "Git saves where you were before those commands in ORIG_HEAD.", example: "git reset --hard ORIG_HEAD", danger: "careful", group: "Undo" },
  { slug: "git-clean", command: "git clean -n / -f", title: "Delete untracked files", summary: "-n previews, -f deletes, -d includes folders. Gone for good: Git never saw them.", danger: "destroys", group: "Undo", simulated: false },

  // ---------- Remotes ----------
  { slug: "git-remote-v", command: "git remote -v", title: "See which remotes are configured", summary: "Lists each remote name and its URL.", danger: "safe", group: "Remotes", tags: "origin url" },
  { slug: "git-remote-add", command: "git remote add <name> <url>", title: "Connect a remote", summary: "Names a URL so you can push/fetch with that name.", example: "git remote add origin https://github.com/you/project.git", danger: "safe", group: "Remotes" },
  { slug: "upstream-remote", command: "git remote add upstream <url>", title: "Track the original repo of a fork", summary: "Convention: origin = your fork, upstream = the project you forked.", example: "git fetch upstream\ngit merge upstream/main", danger: "safe", group: "Remotes", tags: "fork sync" },
  { slug: "remote-tracking-branch", command: "origin/main", title: "What origin/main is", summary: "Your computer's memory of where main was on GitHub when you last fetched. It moves on fetch/pull/push, never on its own.", danger: "safe", group: "Concepts", tags: "concept tracking" },
  { slug: "git-fetch", command: "git fetch", title: "Download new commits without changing your work", summary: "Updates origin/* labels. Your branches and files are untouched.", example: "git fetch\ngit fetch upstream", graph: "New commits appear; origin/* labels move.", danger: "safe", group: "Remotes", tags: "download update" },
  { slug: "git-fetch-prune", command: "git fetch --prune", title: "Forget remote branches that were deleted", summary: "Removes origin/* labels for branches deleted on GitHub.", danger: "safe", group: "Remotes" },
  { slug: "git-pull", command: "git pull", title: "Fetch and integrate", summary: "git fetch, then merge (or rebase) the upstream branch into yours. If both sides have new commits you must choose: --rebase or --no-rebase.", example: "git pull\ngit pull --ff-only", danger: "safe", group: "Remotes", tags: "update download" },
  { slug: "git-pull-rebase", command: "git pull --rebase", title: "Pull without merge commits", summary: "Replays your local commits on top of what you fetched. The standard fix for a rejected push.", example: "git pull --rebase\ngit config pull.rebase true", danger: "careful", group: "Remotes", tags: "rejected" },
  { slug: "git-config-pull-rebase", command: "git config pull.rebase true", title: "Make git pull rebase by default", summary: "Stops the 'divergent branches' prompt and avoids pull merge commits.", danger: "safe", group: "Remotes" },
  { slug: "git-push", command: "git push", title: "Upload your commits", summary: "Sends the current branch to its upstream. Rejected if the remote has commits you don't (pull first).", graph: "Commits copy up; origin/<branch> moves.", danger: "safe", group: "Remotes", tags: "upload publish" },
  { slug: "git-push-u", command: "git push -u origin <branch>", title: "Push a new branch and track it", summary: "-u sets upstream so later git push / git pull need no arguments.", example: "git push -u origin add-search", danger: "safe", group: "Remotes", tags: "set-upstream first push" },
  { slug: "git-push-force-with-lease", command: "git push --force-with-lease", title: "Force-push safely (after a rebase)", summary: "Overwrites the remote branch only if it's still where you last saw it. Never use plain --force on shared branches.", danger: "rewrites", group: "Remotes", tags: "force rebase" },
  { slug: "git-push-delete", command: "git push origin --delete <branch>", title: "Delete a branch on GitHub", summary: "Removes the remote branch. Your local branch is untouched.", danger: "careful", group: "Remotes" },
  { slug: "git-push-tags", command: "git push --tags", title: "Upload tags", summary: "Tags aren't pushed by default.", danger: "safe", group: "Remotes" },

  // ---------- GitHub ----------
  { slug: "github-flow", command: "branch → push → PR → merge", title: "The GitHub flow", summary: "Branch for one change, commit, push the branch, open a pull request, get a review, merge, delete the branch, pull main.", danger: "safe", group: "GitHub", tags: "workflow process", preset: "team" },
  { slug: "gh-repo-create", command: "gh repo create", title: "Publish a local project to GitHub", summary: "Creates the GitHub repo; --source=. --push wires up origin and pushes.", example: "gh repo create recipe-box --public --source=. --push", danger: "safe", group: "GitHub", tags: "publish new" },
  { slug: "gh-repo-fork", command: "gh repo fork <owner/repo> --clone", title: "Fork and clone a project", summary: "Forks on GitHub, clones your fork, adds upstream.", example: "gh repo fork acme/recipes --clone", danger: "safe", group: "GitHub", tags: "open source contribute", preset: "open-source" },
  { slug: "gh-pr-create", command: "gh pr create", title: "Open a pull request", summary: "From the current (pushed) branch. --fill uses your commit message; --base picks the target branch.", example: 'gh pr create --fill\ngh pr create --title "Add search" --body "Closes #12"', danger: "safe", group: "GitHub", tags: "pull request PR" },
  { slug: "gh-pr-list", command: "gh pr list", title: "List pull requests", summary: "Open PRs by default; --state all for everything.", danger: "safe", group: "GitHub" },
  { slug: "gh-pr-checkout", command: "gh pr checkout <n>", title: "Check out someone's PR locally", summary: "Fetches the PR's branch and switches to it, to test or review.", danger: "safe", group: "GitHub", tags: "review" },
  { slug: "gh-pr-review", command: "gh pr review <n> --approve", title: "Review a pull request", summary: "--approve, --request-changes or --comment. You can't approve your own PR.", danger: "safe", group: "GitHub" },
  { slug: "gh-pr-merge", command: "gh pr merge <n> --squash", title: "Merge a pull request", summary: "--merge, --squash or --rebase; --delete-branch cleans up. Then git pull locally.", example: "gh pr merge 12 --squash --delete-branch", danger: "safe", group: "GitHub" },
  { slug: "merge-methods", command: "merge / squash / rebase", title: "Which merge button to use", summary: "Merge commit keeps every commit plus a merge point. Squash makes one commit per PR (tidy main). Rebase replays commits with no merge commit. Same files either way.", danger: "safe", group: "GitHub", tags: "squash and merge" },
  { slug: "gh-pr-checks", command: "gh pr checks", title: "See CI status for a PR", summary: "Lists each check and whether it passed.", danger: "safe", group: "GitHub", tags: "ci status" },
  { slug: "github-actions", command: ".github/workflows/ci.yml", title: "Run tests on every push (GitHub Actions)", summary: "A YAML workflow: on: (when) and jobs → steps (what). uses: borrows an action, run: runs a command. A failing step fails the run.", example: "on: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test", danger: "safe", group: "GitHub", tags: "ci workflow yaml", preset: "protected" },
  { slug: "gh-run-list", command: "gh run list", title: "See recent Actions runs", summary: "gh run view <id> shows steps and logs.", danger: "safe", group: "GitHub" },

  // ---------- Investigate ----------
  { slug: "git-bisect", command: "git bisect start <bad> <good>", title: "Find the commit that introduced a bug", summary: "Checks out the midpoint; you answer git bisect good/bad until Git names the first bad commit. git bisect reset to finish.", example: "git bisect start HEAD v1.0\ngit bisect bad\ngit bisect good\ngit bisect reset", danger: "safe", group: "Investigate", tags: "bug binary search regression", preset: "bisect" },
  { slug: "git-bisect-run", command: "git bisect run <cmd>", title: "Let Git bisect automatically", summary: "Runs the command at each step: exit code 0 = good, non-zero = bad.", example: "git bisect run npm test", danger: "safe", group: "Investigate", preset: "bisect" },
  { slug: "git-blame", command: "git blame <file>", title: "Who last changed each line", summary: "Shows the commit and author for every line. Not simulated here.", danger: "safe", group: "Investigate", simulated: false, tags: "author line" },

  // ---------- Internals ----------
  { slug: "head-file", command: "cat .git/HEAD", title: "How Git knows your current branch", summary: "HEAD is a text file: ref: refs/heads/main. Branches are files in .git/refs/heads holding one commit ID.", example: "cat .git/HEAD\ncat .git/refs/heads/main", danger: "safe", group: "Internals", tags: "refs pointer" },
  { slug: "git-cat-file", command: "git cat-file -p <object>", title: "Look inside a commit, tree or blob", summary: "Prints Git's raw object: a commit lists its tree, parents, author and message.", example: "git cat-file -p HEAD", danger: "safe", group: "Internals", tags: "objects" },
  { slug: "git-rev-parse", command: "git rev-parse <rev>", title: "Turn any name into a full commit ID", summary: "--abbrev-ref HEAD prints the current branch name (handy in scripts).", example: "git rev-parse HEAD~2\ngit rev-parse --abbrev-ref HEAD", danger: "safe", group: "Internals" },
  { slug: "git-submodule-add", command: "git submodule add <url> <path>", title: "Add another repo inside yours", summary: "Records the other repo's URL in .gitmodules and pins one commit. Commit the result.", example: "git submodule add https://github.com/acme/design-tokens.git tokens", danger: "safe", group: "Internals", tags: "nested dependency" },
  { slug: "git-submodule-update", command: "git submodule update --init", title: "Fetch submodules after cloning", summary: "--remote moves the pins to the latest commit of each submodule (then commit).", danger: "safe", group: "Internals" },
];

export const cheatBySlug = (slug: string) => CHEATS.find((c) => c.slug === slug);

/** Lower-case haystack for instant search. */
export const haystack = (c: Cheat) => `${c.command} ${c.title} ${c.summary} ${c.tags ?? ""} ${c.example ?? ""}`.toLowerCase();

export function searchCheats(q: string, list: Cheat[] = CHEATS): Cheat[] {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  const scored = list
    .map((c) => {
      const h = haystack(c);
      if (!words.every((w) => h.includes(w))) return null;
      let s = 0;
      const cmd = c.command.toLowerCase();
      const query = words.join(" ");
      const bare = cmd.replace(/^git /, "").split(" ")[0];
      // naming a command exactly ranks it first; its --flag variants come right after it
      if (bare === query || bare === query.replace(/^git /, "")) s += / -/.test(cmd) ? 7 : 10;
      if (cmd.startsWith(query) || cmd.startsWith("git " + query)) s += 4;
      for (const w of words) {
        if (c.command.toLowerCase().includes(w)) s += 3;
        if (c.title.toLowerCase().includes(w)) s += 2;
        if ((c.tags ?? "").includes(w)) s += 1;
      }
      return { c, s };
    })
    .filter((x): x is { c: Cheat; s: number } => !!x);
  return scored.sort((a, b) => b.s - a.s).map((x) => x.c);
}
