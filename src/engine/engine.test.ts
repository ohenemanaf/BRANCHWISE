import { describe, expect, it } from "vitest";
import { merge3 } from "./diff";
import { teammateCommit, teammateReview } from "./github";
import { emptyWorld, isAncestor, status } from "./repo";
import { mutate, run, runRebaseTodo, script } from "./run";
import { basicRepo, clonedRepo, head, local, msg, rev, sh, text } from "./test-helpers";

describe("shell parsing + rollback", () => {
  it("&& stops at the first failure and keeps earlier results", () => {
    const r = run(basicRepo(), 'echo "x" > a.txt && git add nope.txt && git add a.txt');
    expect(r.ok).toBe(false);
    expect(local(r.world).workdir["a.txt"]).toBe("x\n");
    expect(local(r.world).index["a.txt"]).toBeUndefined();
    expect(text(r)).toContain("pathspec 'nope.txt' did not match");
  });
  it("a failing command leaves the world unchanged", () => {
    const w = basicRepo();
    const r = run(w, "git switch nowhere");
    expect(r.ok).toBe(false);
    expect(r.world).toBe(w);
  });
  it("never mutates its input", () => {
    const w = basicRepo();
    const snap = JSON.stringify(w);
    run(w, "git commit --allow-empty -m x");
    expect(JSON.stringify(w)).toBe(snap);
  });
  it("redirects and appends", () => {
    const { world } = sh(basicRepo(), 'echo "a" > f.txt', 'echo "b" >> f.txt');
    expect(local(world).workdir["f.txt"]).toBe("a\nb\n");
  });
  it("unknown commands read like bash", () => {
    expect(text(run(basicRepo(), "gti status"))).toContain("bash: gti: command not found");
    expect(text(run(basicRepo(), "git comit"))).toContain("git: 'comit' is not a git command");
  });
});

describe("init / add / commit / status", () => {
  it("refuses git commands outside a repo", () => {
    expect(text(run(emptyWorld(), "git status"))).toContain("not a git repository");
  });
  it("makes a root commit and a clean tree", () => {
    const w = basicRepo();
    expect(Object.keys(local(w).commits)).toHaveLength(1);
    expect(text(run(w, "git status"))).toContain("nothing to commit, working tree clean");
  });
  it("hashes are deterministic", () => {
    expect(head(basicRepo())).toBe(head(basicRepo()));
  });
  it("reports staged, unstaged and untracked separately", () => {
    const { world } = sh(basicRepo(), 'echo "more" >> README.md', 'echo "n" > new.txt', "git add new.txt", 'echo "u" > untracked.txt');
    const st = status(local(world));
    expect(st.staged).toEqual([{ path: "new.txt", kind: "new file" }]);
    expect(st.unstaged).toEqual([{ path: "README.md", kind: "modified" }]);
    expect(st.untracked).toEqual(["untracked.txt"]);
  });
  it("commit with nothing staged fails with git's message", () => {
    const r = run(basicRepo(), 'git commit -m "empty"');
    expect(r.ok).toBe(false);
    expect(text(r)).toContain("nothing to commit, working tree clean");
  });
  it("commit -am stages tracked changes only", () => {
    const { world } = sh(basicRepo(), 'echo "v2" > README.md', 'echo "x" > new.txt', 'git commit -am "update"');
    expect(local(world).commits[head(world)!].tree).toEqual({ "README.md": "v2\n" });
    expect(status(local(world)).untracked).toEqual(["new.txt"]);
  });
  it("--amend replaces the last commit (new id, same parent)", () => {
    const w = sh(basicRepo(), 'echo "a" > a.txt', "git add .", 'git commit -m "add a"').world;
    const before = head(w)!;
    const parent = local(w).commits[before].parents[0];
    const after = sh(w, 'echo "b" > b.txt', "git add b.txt", "git commit --amend --no-edit").world;
    expect(head(after)).not.toBe(before);
    expect(local(after).commits[head(after)!].parents).toEqual([parent]);
    expect(msg(after, "HEAD")).toBe("add a");
  });
  it(".gitignore hides files and blocks add", () => {
    const { world, last } = sh(basicRepo(), 'echo ".env" > .gitignore', 'echo "SECRET=1" > .env', "git add .env");
    expect(last.ok).toBe(false);
    expect(text(last)).toContain("ignored by one of your .gitignore files");
    expect(status(local(world)).untracked).toEqual([".gitignore"]);
  });
  it("git rm --cached untracks but keeps the file", () => {
    const { world } = sh(basicRepo(), 'echo "k" > .env', "git add .env", 'git commit -m "oops"', "git rm --cached .env", 'git commit -m "untrack"');
    expect(local(world).workdir[".env"]).toBe("k\n");
    expect(local(world).commits[head(world)!].tree[".env"]).toBeUndefined();
  });
  it("restore and restore --staged", () => {
    const { world } = sh(basicRepo(), 'echo "bad" > README.md', "git add README.md", "git restore --staged README.md");
    expect(local(world).index["README.md"]).toBe("hello\n");
    expect(local(world).workdir["README.md"]).toBe("bad\n");
    const w2 = sh(world, "git restore README.md").world;
    expect(local(w2).workdir["README.md"]).toBe("hello\n");
  });
});

describe("revisions", () => {
  const w = script(basicRepo(), ['echo 2 > a', "git add a", 'git commit -m two', 'echo 3 > a', 'git commit -am three', "git tag v1 HEAD~1"]);
  it("resolves ~, ^, tags, short ids and reflog", () => {
    expect(msg(w, "HEAD~1")).toBe("two");
    expect(msg(w, "HEAD^^")).toBe("Initial commit");
    expect(msg(w, "v1")).toBe("two");
    expect(msg(w, rev(w, "HEAD").slice(0, 7))).toBe("three");
    expect(msg(w, "HEAD@{1}")).toBe("two");
  });
  it("unknown revisions fail like git", () => {
    expect(text(run(w, "git show nope"))).toContain("ambiguous argument 'nope'");
  });
});

describe("branches and switching", () => {
  it("creates, switches and lists", () => {
    const { world, last } = sh(basicRepo(), "git switch -c feature", "git branch");
    expect(local(world).head).toEqual({ kind: "branch", name: "feature" });
    expect(text(last)).toBe("* feature\n  main");
  });
  it("carries uncommitted changes when they don't collide", () => {
    const { world } = sh(basicRepo(), "git branch other", 'echo "wip" > README.md', "git switch other");
    expect(local(world).workdir["README.md"]).toBe("wip\n");
  });
  it("refuses to overwrite local changes", () => {
    const w = sh(basicRepo(), "git switch -c other", 'echo "o" > README.md', 'git commit -am "other"', "git switch main", 'echo "mine" > README.md').world;
    const r = run(w, "git switch other");
    expect(r.ok).toBe(false);
    expect(text(r)).toContain("Your local changes to the following files would be overwritten by checkout");
  });
  it("branch -d protects unmerged work, -D forces", () => {
    const w = sh(basicRepo(), "git switch -c f", "echo x > x", "git add x", "git commit -m x", "git switch main").world;
    expect(text(run(w, "git branch -d f"))).toContain("not fully merged");
    expect(local(run(w, "git branch -D f").world).branches.f).toBeUndefined();
  });
  it("checkout -b and switch - go back", () => {
    const { world } = sh(basicRepo(), "git checkout -b a", "git switch -");
    expect(local(world).head).toEqual({ kind: "branch", name: "main" });
  });
  it("detached HEAD commits are warned about when you leave", () => {
    const w = sh(basicRepo(), "echo 2 > two", "git add .", "git commit -m two", "git checkout HEAD~1").world;
    expect(local(w).head.kind).toBe("detached");
    const w2 = sh(w, "echo exp > exp", "git add .", 'git commit -m "experiment"').world;
    const r = run(w2, "git switch main");
    expect(text(r)).toContain("you are leaving 1 commit behind");
    // and the reflog still finds it
    const lost = local(w2).commits[head(w2)!].id;
    expect(local(r.world).reflog.HEAD.some((e) => e.id === lost)).toBe(true);
  });
  it("switch to a remote-only branch creates a tracking branch", () => {
    const w = mutate(clonedRepo(), (d) => {
      teammateCommit(d, "origin", "feature", { "f.txt": "f\n" }, "feature work");
      d.repos.origin.branches.feature = d.repos.origin.branches.feature;
    });
    const { world, last } = sh(w, "git fetch", "git switch feature");
    expect(text(last)).toContain("set up to track 'origin/feature'");
    expect(local(world).upstream.feature).toEqual({ remote: "origin", branch: "feature" });
  });
});

describe("merge", () => {
  const diverged = () =>
    script(basicRepo(), [
      'echo "1\n2\n3\n4\n5" > nums.txt',
      "git add .",
      'git commit -m "nums"',
      "git switch -c feature",
      'echo "1\nTWO\n3\n4\n5" > nums.txt',
      'git commit -am "feature: two"',
      "git switch main",
    ]);

  it("fast-forwards when possible", () => {
    const { world, last } = sh(diverged(), "git merge feature");
    expect(text(last)).toContain("Fast-forward");
    expect(head(world)).toBe(rev(world, "feature"));
  });
  it("--no-ff makes a merge commit with two parents", () => {
    const { world } = sh(diverged(), "git merge --no-ff feature");
    expect(local(world).commits[head(world)!].parents).toHaveLength(2);
    expect(msg(world, "HEAD")).toBe("Merge branch 'feature'");
  });
  it("merges edits to different lines cleanly", () => {
    const { world, last } = sh(diverged(), 'echo "1\n2\n3\n4\nFIVE" > nums.txt', 'git commit -am "main: five"', "git merge feature");
    expect(text(last)).toContain("Merge made by the 'ort' strategy.");
    expect(local(world).workdir["nums.txt"]).toBe("1\nTWO\n3\n4\nFIVE\n");
  });
  it("conflicts on the same line, then resolves and commits", () => {
    const w = sh(diverged(), 'echo "1\nDOS\n3\n4\n5" > nums.txt', 'git commit -am "main: dos"').world;
    const r = run(w, "git merge feature");
    expect(r.ok).toBe(false);
    expect(text(r)).toContain("CONFLICT (content): Merge conflict in nums.txt");
    const repo = local(r.world);
    expect(repo.workdir["nums.txt"]).toBe("1\n<<<<<<< HEAD\nDOS\n=======\nTWO\n>>>>>>> feature\n3\n4\n5\n");
    expect(text(run(r.world, 'git commit -m "x"'))).toContain("unmerged files");
    const done = sh(r.world, 'echo "1\nTWO\n3\n4\n5" > nums.txt', "git add nums.txt", "git commit").world;
    const c = local(done).commits[head(done)!];
    expect(c.parents).toEqual([rev(w, "main"), rev(w, "feature")]);
    expect(c.message).toBe("Merge branch 'feature'");
    expect(local(done).op).toBeNull();
  });
  it("--abort restores the pre-merge state", () => {
    const w = sh(diverged(), 'echo "1\nDOS\n3\n4\n5" > nums.txt', 'git commit -am "main: dos"').world;
    const { world } = sh(w, "git merge feature", "git merge --abort");
    expect(local(world).workdir["nums.txt"]).toBe("1\nDOS\n3\n4\n5\n");
    expect(local(world).op).toBeNull();
  });
  it("checkout --theirs takes their side of a conflict", () => {
    const w = sh(diverged(), 'echo "1\nDOS\n3\n4\n5" > nums.txt', 'git commit -am "main: dos"', "git merge feature", "git checkout --theirs nums.txt").world;
    expect(local(w).workdir["nums.txt"]).toBe("1\nTWO\n3\n4\n5\n");
  });
  it("modify/delete conflicts", () => {
    const w = script(basicRepo(), ["git switch -c del", "git rm README.md", 'git commit -m "delete readme"', "git switch main", 'echo "edited" > README.md', 'git commit -am "edit readme"']);
    const r = run(w, "git merge del");
    expect(text(r)).toContain("CONFLICT (modify/delete): README.md deleted in del and modified in HEAD");
  });
  it("already up to date", () => {
    expect(text(run(diverged(), "git merge main"))).toBe("Already up to date.");
  });
});

describe("merge3", () => {
  it("adjacent line edits conflict, separated edits don't", () => {
    expect(merge3("a\nb\nc\nd\n", "a\nB\nc\nd\n", "a\nb\nC\nd\n", { ours: "o", theirs: "t" }).clean).toBe(false);
    expect(merge3("a\nb\nc\nd\ne\n", "a\nB\nc\nd\ne\n", "a\nb\nc\nD\ne\n", { ours: "o", theirs: "t" })).toEqual({ clean: true, content: "a\nB\nc\nD\ne\n" });
  });
  it("identical changes on both sides are clean", () => {
    expect(merge3("a\n", "b\n", "b\n", { ours: "o", theirs: "t" }).clean).toBe(true);
  });
});

describe("rebase", () => {
  const forked = () =>
    script(basicRepo(), [
      "git switch -c feature",
      "echo f1 > f1.txt",
      "git add .",
      'git commit -m "f1"',
      "echo f2 > f2.txt",
      "git add .",
      'git commit -m "f2"',
      "git switch main",
      "echo m1 > m1.txt",
      "git add .",
      'git commit -m "m1"',
      "git switch feature",
    ]);
  it("replays commits on top of the new base with new ids", () => {
    const w = forked();
    const oldTip = head(w);
    const { world, last } = sh(w, "git rebase main");
    expect(text(last)).toContain("Successfully rebased and updated refs/heads/feature.");
    expect(head(world)).not.toBe(oldTip);
    expect(msg(world, "HEAD")).toBe("f2");
    expect(msg(world, "HEAD~2")).toBe("m1");
    expect(local(world).head).toEqual({ kind: "branch", name: "feature" });
    // old commits still reachable via ORIG_HEAD / reflog
    expect(rev(world, "ORIG_HEAD")).toBe(oldTip);
  });
  it("is a no-op when already on top", () => {
    const w = sh(forked(), "git rebase main").world;
    expect(text(run(w, "git rebase main"))).toBe("Current branch feature is up to date.");
  });
  it("stops on conflict, continues after resolution", () => {
    const w = script(basicRepo(), [
      "git switch -c feature",
      'echo "feature" > README.md',
      'git commit -am "feature readme"',
      "echo extra > extra.txt",
      "git add .",
      'git commit -m "extra"',
      "git switch main",
      'echo "main" > README.md',
      'git commit -am "main readme"',
      "git switch feature",
    ]);
    const r = run(w, "git rebase main");
    expect(r.ok).toBe(false);
    expect(text(r)).toContain("could not apply");
    expect(local(r.world).head.kind).toBe("detached");
    expect(text(run(r.world, "git rebase --continue"))).toContain("you must edit all merge conflicts");
    const { world, last } = sh(r.world, 'echo "both" > README.md', "git add README.md", "git rebase --continue");
    expect(text(last)).toContain("Successfully rebased");
    expect(msg(world, "HEAD")).toBe("extra");
    expect(msg(world, "HEAD~1")).toBe("feature readme");
    expect(local(world).commits[rev(world, "HEAD~1")].tree["README.md"]).toBe("both\n");
  });
  it("--abort goes back exactly", () => {
    const w = script(basicRepo(), ["git switch -c f", 'echo f > README.md', 'git commit -am f', "git switch main", 'echo m > README.md', 'git commit -am m', "git switch f"]);
    const tip = head(w);
    const { world } = sh(w, "git rebase main", "git rebase --abort");
    expect(head(world)).toBe(tip);
    expect(local(world).head).toEqual({ kind: "branch", name: "f" });
    expect(local(world).workdir["README.md"]).toBe("f\n");
  });
  it("skips commits already upstream (cherry-picked)", () => {
    const w = script(forked(), ["git switch main", `git cherry-pick feature~1`, "git switch feature"]);
    const { last, world } = sh(w, "git rebase main");
    expect(text(last)).toContain("skipped previously applied commit");
    expect(msg(world, "HEAD")).toBe("f2");
    expect(msg(world, "HEAD~1")).toBe("f1");
    expect(msg(world, "HEAD~2")).toBe("m1");
  });
  it("interactive: opens the editor, then squash + drop + reword", () => {
    const w = script(basicRepo(), ["echo a > a", "git add .", "git commit -m a", "echo b > b", "git add .", "git commit -m b", "echo c > c", "git add .", "git commit -m c"]);
    const r = run(w, "git rebase -i HEAD~3");
    const ev = r.events.find((e) => e.type === "open-rebase-editor");
    expect(ev && ev.type === "open-rebase-editor" && ev.steps.map((s) => s.action)).toEqual(["pick", "pick", "pick"]);
    if (ev?.type !== "open-rebase-editor") return;
    const [a, b, c] = ev.steps;
    const res = runRebaseTodo(w, ev.onto, [{ ...a, action: "reword", message: "A!" }, { ...b, action: "squash", message: "A and B" }, { ...c, action: "drop" }], "HEAD~3");
    expect(res.ok).toBe(true);
    expect(msg(res.world, "HEAD")).toBe("A and B");
    expect(msg(res.world, "HEAD~1")).toBe("Initial commit");
    expect(local(res.world).workdir.c).toBeUndefined();
    expect(local(res.world).workdir.b).toBe("b\n");
  });
  it("rejects squash as the first step", () => {
    const w = script(basicRepo(), ["echo a > a", "git add .", "git commit -m a"]);
    const res = runRebaseTodo(w, rev(w, "HEAD~1"), [{ action: "squash", id: head(w)! }], "HEAD~1");
    expect(res.ok).toBe(false);
  });
  it("--onto moves a branch to a different base", () => {
    const w = script(basicRepo(), ["git switch -c a", "echo a > a", "git add .", "git commit -m a", "git switch -c b", "echo b > b", "git add .", "git commit -m b"]);
    const { world } = sh(w, "git rebase --onto main a b");
    expect(msg(world, "HEAD")).toBe("b");
    expect(msg(world, "HEAD~1")).toBe("Initial commit");
  });
});

describe("cherry-pick and revert", () => {
  it("cherry-pick copies a commit with a new id", () => {
    const w = script(basicRepo(), ["git switch -c f", "echo fix > fix.txt", "git add .", 'git commit -m "fix"', "git switch main"]);
    const { world } = sh(w, "git cherry-pick f");
    expect(msg(world, "HEAD")).toBe("fix");
    expect(head(world)).not.toBe(rev(world, "f"));
    expect(local(world).workdir["fix.txt"]).toBe("fix\n");
  });
  it("revert adds an inverse commit", () => {
    const w = script(basicRepo(), ['echo "bad" > README.md', 'git commit -am "break readme"']);
    const { world } = sh(w, "git revert HEAD --no-edit");
    expect(msg(world, "HEAD")).toMatch(/^Revert "break readme"/);
    expect(local(world).workdir["README.md"]).toBe("hello\n");
    expect(local(world).commits[head(world)!].parents).toEqual([rev(w, "HEAD")]);
  });
  it("revert of a merge needs -m", () => {
    const w = script(basicRepo(), ["git switch -c f", "echo f > f", "git add .", "git commit -m f", "git switch main", "echo m > m", "git add .", "git commit -m m", "git merge f"]);
    expect(text(run(w, "git revert HEAD"))).toContain("is a merge but no -m option was given");
    const { world } = sh(w, "git revert -m 1 HEAD");
    expect(local(world).workdir.f).toBeUndefined();
  });
  it("cherry-pick conflict then --continue", () => {
    const w = script(basicRepo(), ["git switch -c f", 'echo "f" > README.md', 'git commit -am "f readme"', "git switch main", 'echo "m" > README.md', 'git commit -am "m readme"']);
    const r = run(w, "git cherry-pick f");
    expect(r.ok).toBe(false);
    const { world } = sh(r.world, 'echo "fm" > README.md', "git add README.md", "git cherry-pick --continue");
    expect(msg(world, "HEAD")).toBe("f readme");
    expect(local(world).op).toBeNull();
  });
});

describe("reset and reflog", () => {
  const three = () => script(basicRepo(), ["echo 2 > a", "git add .", "git commit -m two", "echo 3 > a", "git commit -am three"]);
  it("--soft keeps changes staged", () => {
    const { world } = sh(three(), "git reset --soft HEAD~1");
    expect(msg(world, "HEAD")).toBe("two");
    expect(local(world).index.a).toBe("3\n");
  });
  it("--mixed unstages", () => {
    const { world, last } = sh(three(), "git reset HEAD~1");
    expect(local(world).index.a).toBe("2\n");
    expect(local(world).workdir.a).toBe("3\n");
    expect(text(last)).toContain("Unstaged changes after reset:");
  });
  it("--hard discards, reflog recovers", () => {
    const w = three();
    const lost = head(w);
    const { world, last } = sh(w, "git reset --hard HEAD~2");
    expect(text(last)).toContain("HEAD is now at");
    expect(local(world).workdir.a).toBeUndefined();
    const rl = text(run(world, "git reflog"));
    expect(rl).toContain("HEAD@{1}: commit: three");
    const back = sh(world, "git reset --hard HEAD@{1}").world;
    expect(head(back)).toBe(lost);
    expect(local(back).workdir.a).toBe("3\n");
  });
  it("--hard keeps untracked files", () => {
    const { world } = sh(three(), "echo u > untracked.txt", "git reset --hard HEAD~1");
    expect(local(world).workdir["untracked.txt"]).toBe("u\n");
  });
});

describe("stash", () => {
  it("push and pop", () => {
    const { world, all } = sh(basicRepo(), 'echo "wip" > README.md', "git stash", "git status");
    expect(text(all[1])).toContain("Saved working directory and index state WIP on main");
    expect(text(all[2])).toContain("nothing to commit");
    const after = sh(world, "git stash pop").world;
    expect(local(after).workdir["README.md"]).toBe("wip\n");
    expect(local(after).stash).toHaveLength(0);
  });
  it("leaves untracked files unless -u", () => {
    const w = sh(basicRepo(), "echo n > new.txt", "git stash").world;
    expect(text(run(basicRepo(), "git stash"))).toBe("No local changes to save");
    expect(local(w).workdir["new.txt"]).toBe("n\n");
    const w2 = sh(basicRepo(), "echo n > new.txt", "git stash -u").world;
    expect(local(w2).workdir["new.txt"]).toBeUndefined();
    expect(local(sh(w2, "git stash pop").world).workdir["new.txt"]).toBe("n\n");
  });
  it("moves work to another branch (the classic use)", () => {
    const { world } = sh(basicRepo(), 'echo "oops on main" > README.md', "git stash", "git switch -c fix", "git stash pop", 'git commit -am "fix"');
    expect(msg(world, "HEAD")).toBe("fix");
    expect(local(world).commits[rev(world, "main")].tree["README.md"]).toBe("hello\n");
  });
});

describe("bisect", () => {
  it("bisect run finds the first bad commit", () => {
    let w = basicRepo();
    w = mutate(w, (d) => {
      d.testRule = { path: "app.js", failsWhen: "BUG" };
    });
    const lines: string[] = [];
    for (let i = 1; i <= 8; i++) {
      lines.push(i === 5 ? `echo "v${i} BUG" > app.js` : i > 5 ? `echo "v${i} BUG" > app.js` : `echo "v${i}" > app.js`, "git add .", `git commit -m "c${i}"`);
    }
    w = script(w, lines);
    const { world, last } = sh(w, "git bisect start HEAD HEAD~7", "git bisect run npm test");
    expect(text(last)).toContain("is the first bad commit");
    const found = /([0-9a-f]{40}) is the first bad commit/.exec(text(last))![1];
    expect(local(world).commits[found].message).toBe("c5");
    const reset = sh(world, "git bisect reset").world;
    expect(local(reset).head).toEqual({ kind: "branch", name: "main" });
  });
});

describe("remotes", () => {
  it("clone sets origin, tracking and remote refs", () => {
    const w = clonedRepo();
    const repo = local(w);
    expect(repo.remoteRefs.origin.main).toBe(repo.branches.main);
    expect(repo.upstream.main).toEqual({ remote: "origin", branch: "main" });
    expect(text(run(w, "git status"))).toContain("up to date with 'origin/main'");
  });
  it("push updates GitHub and the tracking ref", () => {
    const { world, last } = sh(clonedRepo(), "echo x > x", "git add .", "git commit -m x", "git push");
    expect(world.repos.origin.branches.main).toBe(head(world));
    expect(local(world).remoteRefs.origin.main).toBe(head(world));
    expect(text(last)).toContain("main -> main");
  });
  it("new branch push needs -u, then suggests a PR", () => {
    const w = sh(clonedRepo(), "git switch -c feature", "echo x > x", "git add .", "git commit -m x").world;
    expect(text(run(w, "git push"))).toContain("has no upstream branch");
    const r = run(w, "git push -u origin feature");
    expect(text(r)).toContain("Create a pull request for 'feature'");
    expect(local(r.world).upstream.feature).toEqual({ remote: "origin", branch: "feature" });
  });
  it("rejects a push when the remote moved, pull fixes it", () => {
    let w = sh(clonedRepo(), "echo mine > mine.txt", "git add .", 'git commit -m "mine"').world;
    w = mutate(w, (d) => void teammateCommit(d, "origin", "main", { "theirs.txt": "t\n" }, "theirs"));
    const r = run(w, "git push");
    expect(r.ok).toBe(false);
    expect(text(r)).toContain("[rejected]");
    expect(text(r)).toContain("fetch first");
    const p = run(w, "git pull");
    expect(p.ok).toBe(false);
    expect(text(p)).toContain("Need to specify how to reconcile divergent branches");
    // the fetch half still happened
    expect(local(p.world).remoteRefs.origin.main).toBe(p.world.repos.origin.branches.main);
    const { world } = sh(p.world, "git pull --rebase", "git push");
    expect(msg(world, "HEAD")).toBe("mine");
    expect(msg(world, "HEAD~1")).toBe("theirs");
    expect(world.repos.origin.branches.main).toBe(head(world));
  });
  it("pull fast-forwards when you have nothing new", () => {
    const w = mutate(clonedRepo(), (d) => void teammateCommit(d, "origin", "main", { "t.txt": "t\n" }, "theirs"));
    const { world, last } = sh(w, "git pull");
    expect(text(last)).toContain("Fast-forward");
    expect(local(world).workdir["t.txt"]).toBe("t\n");
  });
  it("force-with-lease refuses to clobber unseen work; --force does", () => {
    let w = sh(clonedRepo(), "echo a > a", "git add .", "git commit -m a", "git push", "git commit --amend -m a2").world;
    w = mutate(w, (d) => void teammateCommit(d, "origin", "main", { "t.txt": "t\n" }, "teammate"));
    const r = run(w, "git push --force-with-lease");
    expect(text(r)).toContain("(stale info)");
    const f = run(w, "git push --force");
    expect(text(f)).toContain("(forced update)");
    expect(f.world.repos.origin.branches.main).toBe(head(f.world));
  });
  it("fetch --prune drops deleted branches", () => {
    let w = mutate(clonedRepo(), (d) => void teammateCommit(d, "origin", "old", { o: "o\n" }, "old"));
    w = sh(w, "git fetch").world;
    expect(local(w).remoteRefs.origin.old).toBeDefined();
    w = mutate(w, (d) => void delete d.repos.origin.branches.old);
    expect(local(sh(w, "git fetch").world).remoteRefs.origin.old).toBeDefined();
    expect(local(sh(w, "git fetch --prune").world).remoteRefs.origin.old).toBeUndefined();
  });
  it("push --delete removes a remote branch", () => {
    const w = sh(clonedRepo(), "git switch -c f", "echo f > f", "git add .", "git commit -m f", "git push -u origin f").world;
    const { world } = sh(w, "git push origin --delete f");
    expect(world.repos.origin.branches.f).toBeUndefined();
  });
});

describe("GitHub flow", () => {
  const withFeature = () => sh(clonedRepo(), "git switch -c feature", "echo f > f.txt", "git add .", 'git commit -m "Add f"', "git push -u origin feature").world;

  it("open a PR, can't self-approve, teammate approves, squash merge, pull", () => {
    let w = sh(withFeature(), 'gh pr create --title "Add f" --body "please review"').world;
    expect(w.github.prs[0]).toMatchObject({ number: 1, head: "feature", base: "main", state: "open" });
    expect(text(run(w, "gh pr review 1 --approve"))).toContain("Can not approve your own pull request");
    w = mutate(w, (d) => teammateReview(d, 1, "approved"));
    const m = run(w, "gh pr merge 1 --squash --delete-branch");
    expect(m.ok).toBe(true);
    expect(text(m)).toContain("Squashed and merged pull request #1");
    w = m.world;
    expect(local(w).head).toEqual({ kind: "branch", name: "main" });
    expect(local(w).branches.feature).toBeUndefined();
    expect(w.repos.origin.commits[w.repos.origin.branches.main].message).toBe("Add f (#1)");
    w = sh(w, "git pull").world;
    expect(local(w).workdir["f.txt"]).toBe("f\n");
  });
  it("merge method creates a merge commit; rebase method copies commits", () => {
    const w = sh(withFeature(), 'gh pr create --title "Add f"').world;
    const merged = run(w, "gh pr merge 1 --merge").world;
    const tip = merged.repos.origin.commits[merged.repos.origin.branches.main];
    expect(tip.parents).toHaveLength(2);
    expect(tip.message).toMatch(/^Merge pull request #1 from you\/feature/);
    const rebased = run(w, "gh pr merge 1 --rebase").world;
    const rt = rebased.repos.origin.commits[rebased.repos.origin.branches.main];
    expect(rt.parents).toHaveLength(1);
    expect(rt.message).toBe("Add f");
  });
  it("protected main: rejects direct push, requires approval and green checks", () => {
    let w = mutate(withFeature(), (d) => {
      d.github.repos.origin.protection.main = { requirePullRequest: true, requireApproval: true, requireChecks: false };
    });
    const direct = run(w, "git switch main && echo z > z && git add . && git commit -m z && git push");
    expect(text(direct)).toContain("GH006: Protected branch update failed");
    w = sh(w, 'gh pr create --title "Add f"').world;
    const blocked = run(w, "gh pr merge 1 --merge");
    expect(text(blocked)).toContain("Review required");
    w = mutate(w, (d) => teammateReview(d, 1, "approved"));
    expect(run(w, "gh pr merge 1 --merge").ok).toBe(true);
  });
  it("Actions run on push and gate the merge", () => {
    let w = mutate(clonedRepo(), (d) => {
      d.testRule = { path: "app.js", failsWhen: "BUG" };
      d.github.repos.origin.protection.main = { requirePullRequest: true, requireApproval: false, requireChecks: true };
    });
    const yml = "name: CI\\non: [push, pull_request]\\njobs:\\n  test:\\n    runs-on: ubuntu-latest\\n    steps:\\n      - uses: actions/checkout@v4\\n      - run: npm test";
    w = sh(w, "git switch -c ci", `write .github/workflows/ci.yml "${yml}"`, 'echo "console.log(1) // BUG" > app.js', "git add .", 'git commit -m "ci + bug"', "git push -u origin ci", 'gh pr create --title "CI"').world;
    expect(w.github.runs.at(-1)!.status).toBe("failure");
    expect(text(run(w, "gh pr merge 1 --merge"))).toContain("Required check failed: CI");
    w = sh(w, 'echo "console.log(1)" > app.js', 'git commit -am "fix bug"', "git push").world;
    expect(w.github.runs.at(-1)!.status).toBe("success");
    expect(run(w, "gh pr merge 1 --merge").ok).toBe(true);
  });
  it("PR with conflicts can't be merged on GitHub", () => {
    let w = sh(clonedRepo(), "git switch -c feature", 'echo "feature" > README.md', 'git commit -am "readme f"', "git push -u origin feature", 'gh pr create --title "readme"').world;
    w = mutate(w, (d) => void teammateCommit(d, "origin", "main", { "README.md": "main\n" }, "readme main"));
    expect(text(run(w, "gh pr merge 1 --merge"))).toContain("cannot be cleanly created");
  });
  it("fork → clone → upstream remote → PR into the parent", () => {
    let w = mutate(emptyWorld(), (d) => {
      const g = { key: "upstream", owner: "acme", name: "lib", forkOf: null, defaultBranch: "main", protection: {} };
      d.github.repos.upstream = g;
      d.repos.upstream = { ...structuredClone(clonedRepo().repos.origin), name: "acme/lib" };
    });
    w = sh(w, "gh repo fork acme/lib --clone").world;
    const repo = local(w);
    expect(repo.remotes.origin).toBe("https://github.com/you/lib.git");
    expect(repo.remotes.upstream).toBe("https://github.com/acme/lib.git");
    w = sh(w, "git switch -c patch", "echo p > p", "git add .", "git commit -m patch", "git push -u origin patch", 'gh pr create --title "Patch"').world;
    expect(w.github.prs[0]).toMatchObject({ repo: "upstream", headRepo: "origin", head: "patch" });
    // keep the fork in sync
    w = mutate(w, (d) => void teammateCommit(d, "upstream", "main", { u: "u\n" }, "upstream work"));
    const synced = sh(w, "git switch main", "git fetch upstream", "git merge upstream/main", "git push origin main").world;
    expect(synced.repos.origin.branches.main).toBe(synced.repos.upstream.branches.main);
  });
  it("gh repo create --source=. --push publishes an existing project", () => {
    const { world } = sh(basicRepo(), "gh repo create project --public --source=. --push");
    expect(world.repos.origin.branches.main).toBe(head(world));
    expect(local(world).upstream.main).toEqual({ remote: "origin", branch: "main" });
  });
});

describe("ancestry helpers", () => {
  it("isAncestor follows merge parents", () => {
    const w = script(basicRepo(), ["git switch -c f", "echo f > f", "git add .", "git commit -m f", "git switch main", "echo m > m", "git add .", "git commit -m m", "git merge f"]);
    expect(isAncestor(local(w), rev(w, "f"), head(w)!)).toBe(true);
  });
});
