"use client";

import Link from "next/link";
import { MODULES, lessonKey } from "@/content/modules";
import { MISTAKES } from "@/content/mistakes";
import { useProgress } from "@/lib/progress";
import { Check } from "@/components/ui/Check";

export function LearnIndex() {
  const progress = useProgress();
  const all = MODULES.flatMap((m) => m.lessons.map((l) => lessonKey(m.slug, l.slug)));
  const done = all.filter((k) => progress.lessons[k]?.done).length;
  const nextUp = MODULES.flatMap((m) => m.lessons.map((l) => ({ m, l }))).find(({ m, l }) => !progress.lessons[lessonKey(m.slug, l.slug)]?.done);

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Learn Git and GitHub</h1>
          <p className="mt-1 max-w-[60ch] text-[14px] text-ink-2">
            Every lesson runs in a live repository on the right of the screen. Read, watch a command animate, then do it yourself. Your progress is saved in this browser.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-ink-2">
            {done} of {all.length} lessons done
          </p>
          <div className="mt-1 h-1.5 w-44 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done} aria-label="Lessons completed">
            <div className="h-full rounded-full bg-[var(--lane-1)] transition-[width] duration-500" style={{ width: `${(done / all.length) * 100}%` }} />
          </div>
          {nextUp && (
            <Link href={`/learn/${nextUp.m.slug}/${nextUp.l.slug}`} className="mt-2 inline-flex h-8 items-center rounded-[var(--radius-sm)] bg-ink px-3 text-[13px] font-medium text-surface">
              {done ? "Continue" : "Start"}: {nextUp.l.title}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {MODULES.map((m, mi) => (
          <section key={m.slug} aria-labelledby={`m-${m.slug}`}>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-muted" aria-hidden>
                {mi < 3 ? mi + 1 : 5}
              </span>
              <div>
                <h2 id={`m-${m.slug}`} className="text-[17px] font-semibold">
                  {m.title}
                </h2>
                <p className="text-[13px] text-ink-2">{m.summary}</p>
              </div>
            </div>
            <ul className="divide-y divide-rule overflow-hidden rounded-[var(--radius)] border border-rule bg-surface">
              {m.lessons.map((l, li) => {
                const n = MODULES.slice(0, mi).reduce((s, x) => s + x.lessons.length, 0) + li + 1;
                const p = progress.lessons[lessonKey(m.slug, l.slug)];
                return (
                  <li key={l.slug}>
                    <Link href={`/learn/${m.slug}/${l.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <Check done={!!p?.done} started={!!p && !p.done} label={String(n)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium">{l.title}</span>
                        <span className="block truncate text-[12.5px] text-muted">{l.summary}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-muted">{l.minutes} min</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {mi === 2 && (
              <section aria-labelledby="m-mistakes" className="mt-8">
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="font-mono text-[12px] text-muted" aria-hidden>
                    4
                  </span>
                  <div>
                    <h2 id="m-mistakes" className="text-[17px] font-semibold">
                      Fixing mistakes
                    </h2>
                    <p className="text-[13px] text-ink-2">Short drills: something went wrong, watch the recovery, then do it yourself. Take them in any order.</p>
                  </div>
                </div>
                <ul className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-rule bg-rule sm:grid-cols-2">
                  {MISTAKES.map((d) => (
                    <li key={d.slug} className="bg-surface">
                      <Link href={`/mistakes/${d.slug}`} className="flex h-full items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2">
                        <Check done={!!progress.mistakes[d.slug]} small />
                        <span className="text-[13.5px]">{d.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
