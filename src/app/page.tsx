import Link from "next/link";
import { HeroDemo } from "@/components/site/HeroDemo";
import { MODULES } from "@/content/modules";
import { MISTAKES } from "@/content/mistakes";
import { CHEATS } from "@/content/cheats";

const lessonCount = MODULES.reduce((n, m) => n + m.lessons.length, 0);

const MODES = [
  {
    href: "/learn",
    name: "Learn",
    text: `${lessonCount} lessons from your first commit to interactive rebase, bisect, submodules and GitHub Actions. Each one has you type the commands yourself in a live repository.`,
    cta: "Start the path",
  },
  {
    href: "/sandbox",
    name: "Sandbox",
    text: "Type any Git or gh command and watch branches, HEAD and GitHub update. Presets cover a team repo, a protected main with CI, open-source forks and a bug hunt.",
    cta: "Open the sandbox",
  },
  {
    href: "/mistakes",
    name: "Fix a mistake",
    text: `${MISTAKES.length} drills for the moments everyone hits: committed to the wrong branch, lost work to reset --hard, pushed something bad, stuck in a conflict.`,
    cta: "Pick what went wrong",
  },
  {
    href: "/cheats",
    name: "Cheat codes",
    text: `${CHEATS.length} commands you can search by what you want to do, each marked with how risky it is and linked to the lesson that teaches it.`,
    cta: "Search the reference",
  },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4">
      <section className="grid items-center gap-10 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:py-16">
        <div>
          <h1 className="max-w-[16ch] text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[40px]">See what every Git command does.</h1>
          <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-ink-2">
            Branchwise draws your repository as a map. Commits are stations and branches are lines. Type a command and watch the labels move, commits get copied, and pushes travel to GitHub and back.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/learn/git-basics/first-commit" className="inline-flex h-10 items-center rounded-[var(--radius-sm)] bg-ink px-4 text-[14px] font-medium text-surface">
              Start with your first commit
            </Link>
            <Link href="/sandbox" className="inline-flex h-10 items-center rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-4 text-[14px] font-medium">
              Open the sandbox
            </Link>
          </div>
          <p className="mt-4 text-[12.5px] text-muted">Free. No account. Nothing touches a real repository.</p>
        </div>
        <HeroDemo />
      </section>

      <section aria-labelledby="modes" className="border-t border-rule py-12">
        <h2 id="modes" className="text-[20px] font-semibold tracking-tight">
          Four ways in
        </h2>
        <ul className="mt-5 grid gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-2">
          {MODES.map((m) => (
            <li key={m.href} className="bg-surface">
              <Link href={m.href} className="flex h-full flex-col gap-2 p-5 hover:bg-surface-2">
                <span className="text-[16px] font-semibold">{m.name}</span>
                <span className="text-[14px] leading-relaxed text-ink-2">{m.text}</span>
                <span className="mt-auto pt-1 text-[13px] font-medium text-[var(--lane-0)]">{m.cta}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="real" className="grid gap-8 border-t border-rule py-12 md:grid-cols-3">
        <h2 id="real" className="text-[20px] font-semibold tracking-tight md:col-span-3">
          A real model of Git, not a toy terminal
        </h2>
        <div>
          <h3 className="text-[14.5px] font-semibold">Local and GitHub, side by side</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
            Your clone and the GitHub repo get their own strips, lined up commit by commit. You see why <code className="inline-code">origin/main</code> lags behind, why a push is rejected, and what a squash merge leaves behind.
          </p>
        </div>
        <div>
          <h3 className="text-[14.5px] font-semibold">Nothing silently disappears</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
            After a reset or a rebase, the old commits stay on the map, faded, exactly as Git keeps them. That&apos;s what makes the reflog make sense.
          </p>
        </div>
        <div>
          <h3 className="text-[14.5px] font-semibold">Git&apos;s own messages</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
            Conflicts, rejected pushes and &quot;divergent branches&quot; read the way real Git prints them, so the first time you see them for real, you already know what to do.
          </p>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-rule py-6 text-[12.5px] text-muted">
        <span>Branchwise: an open-source Git learning tool.</span>
        <a href="https://github.com/ohenemanaf/BRANCHWISE" className="hover:text-ink hover:underline">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
