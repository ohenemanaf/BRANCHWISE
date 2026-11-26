"use client";

import { approvals, latestRun, prHeadTip, prMergeability, teammateCommit, teammateReview } from "@/engine/github";
import { mutate } from "@/engine/run";
import type { World } from "@/engine/types";

const btn = "h-7 rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-2.5 text-[12px] hover:bg-surface-2 disabled:opacity-50";

export function GitHubPanel({ world, exec, apply }: { world: World; exec: (line: string) => void; apply: (w: World, note: string) => void }) {
  const repos = Object.values(world.github.repos);
  if (!repos.length)
    return (
      <p className="px-3 py-4 text-[13px] text-muted">
        No GitHub repository in this sandbox yet. Publish yours with <code className="inline-code">gh repo create project --source=. --push</code>, or load the <em>Team project on GitHub</em> preset.
      </p>
    );
  const mate = world.teammate;
  const origin = world.github.repos.origin;
  const prs = [...world.github.prs].reverse();

  const teammatePush = (key: string, branch: string) => {
    const n = (world.github.runs.length + Object.keys(world.repos[key].commits).length) % 97;
    const w = mutate(world, (d) => {
      const cur = d.repos[key].branches[branch] ? d.repos[key].commits[d.repos[key].branches[branch]].tree["NOTES.md"] ?? "" : "";
      teammateCommit(d, key, branch, { "NOTES.md": `${cur}- ${mate}'s note #${n}\n` }, `Add note #${n}`);
    });
    apply(w, `# ${mate} pushed a commit to ${world.github.repos[key].owner}/${world.github.repos[key].name} ${branch}. Your local copy doesn't know yet: try git fetch.`);
  };

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      {repos.map((g) => {
        const r = world.repos[g.key];
        const prot = g.protection[g.defaultBranch];
        return (
          <section key={g.key} className="rounded-[var(--radius)] border border-rule">
            <header className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
              <span className="font-mono text-[12.5px] font-medium">
                {g.owner}/{g.name}
              </span>
              {g.forkOf && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">fork of {world.github.repos[g.forkOf].owner}/{world.github.repos[g.forkOf].name}</span>}
              {prot && <span className="rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{g.defaultBranch} protected</span>}
            </header>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 text-[12px] text-ink-2">
              <span className="mr-1">{Object.keys(r.branches).length} branch{Object.keys(r.branches).length === 1 ? "" : "es"}</span>
              {r.branches[g.defaultBranch] && (
                <button type="button" className={btn} onClick={() => teammatePush(g.key, g.defaultBranch)}>
                  {mate} pushes to {g.defaultBranch}
                </button>
              )}
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={!!prot}
                  onChange={(e) => {
                    const on = e.target.checked;
                    apply(
                      mutate(world, (d) => {
                        if (on) d.github.repos[g.key].protection[g.defaultBranch] = { requirePullRequest: true, requireApproval: true, requireChecks: false };
                        else delete d.github.repos[g.key].protection[g.defaultBranch];
                      }),
                      on ? `# Branch protection on for ${g.defaultBranch}: changes must come through an approved pull request.` : `# Branch protection off for ${g.defaultBranch}.`,
                    );
                  }}
                  className="accent-[var(--lane-0)]"
                />
                Protect {g.defaultBranch}
              </label>
            </div>
          </section>
        );
      })}

      <section>
        <h3 className="mb-1.5 text-[12px] font-medium text-ink-2">Pull requests</h3>
        {!prs.length ? (
          <p className="text-[12.5px] text-muted">
            None yet. Push a branch, then run <code className="inline-code">gh pr create --fill</code>.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {prs.map((pr) => {
              const tip = prHeadTip(world, pr);
              const run = tip ? latestRun(world, tip) : null;
              const m = pr.state === "open" ? prMergeability(world, pr) : null;
              const a = approvals(pr);
              return (
                <li key={pr.number} className="rounded-[var(--radius)] border border-rule">
                  <div className="flex items-start gap-2 px-3 py-2">
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-1.5 text-[11px] font-medium ${
                        pr.state === "open" ? "bg-ok-soft text-ok" : pr.state === "merged" ? "bg-info-soft text-[var(--lane-3)]" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {pr.state === "open" ? "Open" : pr.state === "merged" ? "Merged" : "Closed"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {pr.title} <span className="font-normal text-muted">#{pr.number}</span>
                      </p>
                      <p className="font-mono text-[11.5px] text-muted">
                        {pr.head} into {pr.base}
                        {pr.method ? `, ${pr.method === "merge" ? "merge commit" : pr.method}` : ""}
                      </p>
                    </div>
                  </div>
                  {pr.state === "open" && (
                    <>
                      <ul className="flex flex-col gap-0.5 border-t border-rule px-3 py-1.5 text-[12px]">
                        <li className={a.changesRequested ? "text-bad" : a.approved ? "text-ok" : "text-muted"}>
                          {a.changesRequested ? "Changes requested" : a.approved ? `Approved by ${pr.reviews.filter((r) => r.state === "approved").map((r) => r.author).join(", ")}` : "No reviews yet"}
                        </li>
                        <li className={!run ? "text-muted" : run.status === "success" ? "text-ok" : "text-bad"}>
                          {!run ? "No checks" : `${run.workflow}: ${run.status === "success" ? "passed" : "failed"}`}
                        </li>
                        <li className={m?.ok ? "text-ok" : "text-bad"}>{m?.ok ? "Ready to merge" : m?.reasons[0]}</li>
                      </ul>
                      <div className="flex flex-wrap gap-1.5 border-t border-rule px-3 py-2">
                        <button type="button" className={btn} onClick={() => apply(mutate(world, (d) => teammateReview(d, pr.number, "approved")), `# ${mate} approved PR #${pr.number}.`)}>
                          {mate} approves
                        </button>
                        <button type="button" className={btn} onClick={() => apply(mutate(world, (d) => teammateReview(d, pr.number, "changes_requested")), `# ${mate} requested changes on PR #${pr.number}: "Could you add a test for this?"`)}>
                          {mate} requests changes
                        </button>
                        <span className="basis-full" />
                        {(["squash", "merge", "rebase"] as const).map((meth) => (
                          <button key={meth} type="button" className={btn} onClick={() => exec(`gh pr merge ${pr.number} --${meth} --delete-branch`)}>
                            {meth === "merge" ? "Merge commit" : meth === "squash" ? "Squash and merge" : "Rebase and merge"}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {world.github.runs.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[12px] font-medium text-ink-2">Actions runs</h3>
          <ul className="flex flex-col gap-1.5">
            {[...world.github.runs].reverse().slice(0, 4).map((r) => (
              <li key={r.id} className="rounded-[var(--radius)] border border-rule px-3 py-2">
                <p className="flex items-center gap-2 text-[12.5px]">
                  <span className={`size-2 rounded-full ${r.status === "success" ? "bg-ok" : "bg-bad"}`} aria-hidden />
                  <span className="font-medium">{r.workflow}</span>
                  <span className="text-muted">
                    on {r.branch}, {r.event === "push" ? "push" : "pull request"}
                  </span>
                </p>
                <ul className="mt-1 flex flex-col gap-0.5 pl-4 font-mono text-[11.5px]">
                  {r.steps.map((s, i) => (
                    <li key={i} className={s.status === "failure" ? "text-bad" : s.status === "skipped" ? "text-muted" : "text-ink-2"}>
                      {s.status === "success" ? "✓" : s.status === "failure" ? "✗" : "–"} {s.name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      {origin && <p className="text-[11.5px] text-muted">The buttons stand in for your teammate {mate} and for GitHub&apos;s web page. The merge buttons run the matching <code className="inline-code">gh</code> command in your terminal.</p>}
    </div>
  );
}
