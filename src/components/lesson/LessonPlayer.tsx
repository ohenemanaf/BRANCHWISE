"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { run } from "@/engine/run";
import type { World } from "@/engine/types";
import type { Lesson, Step } from "@/content/types";
import { useSandbox } from "@/lib/useSandbox";
import { Workbench } from "@/components/workbench/Workbench";
import { Prose } from "@/components/ui/Prose";
import { cheatBySlug } from "@/content/cheats";

/** Rebuild the world a learner would have on arriving at step `k`, by replaying earlier steps. */
export function worldAt(lesson: Lesson, k: number): World {
  let w = lesson.start();
  for (let i = 0; i <= k && i < lesson.steps.length; i++) {
    const s = lesson.steps[i];
    if (s.kind === "read") continue;
    if (s.start) w = s.start();
    if (s.kind === "try" && s.enter) w = s.enter.apply(w);
    if (i === k) break;
    const lines = s.kind === "watch" ? s.commands : s.answer;
    for (const l of lines) w = run(w, l).world;
  }
  return w;
}

const DELAY = 900;

export function LessonPlayer({
  lesson,
  savedStep,
  crumbs,
  prev,
  next,
  onStep,
  onComplete,
  completeTitle,
}: {
  lesson: Lesson;
  savedStep: number;
  crumbs: { href: string; label: string }[];
  prev?: { href: string; label: string } | null;
  next?: { href: string; label: string } | null;
  onStep: (i: number) => void;
  onComplete: () => void;
  completeTitle: string;
}) {
  const start = Math.min(Math.max(0, savedStep), lesson.steps.length - 1);
  const [index, setIndex] = useState(start);
  const [initialWorld] = useState(() => worldAt(lesson, start));
  const sb = useSandbox(initialWorld, start > 0 ? `Picked up where you left off: step ${start + 1}.` : undefined);
  const [played, setPlayed] = useState<Record<number, boolean>>({});
  const [playing, setPlaying] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [finished, setFinished] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const step: Step = lesson.steps[index];
  const last = index === lesson.steps.length - 1;

  const goalMet = useMemo(() => (step.kind === "try" ? step.check(sb.world) : false), [step, sb.world]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Finishing the last step completes the lesson.
  useEffect(() => {
    if (last && step.kind === "try" && goalMet && !finished) {
      onComplete();
    }
  }, [last, step, goalMet, finished, onComplete]);

  const playLines = (lines: string[], before?: World) => {
    timers.current.forEach(clearTimeout);
    if (before) sb.reset(before, "Replaying from the start of this step.");
    setPlaying(true);
    lines.forEach((l, i) => {
      timers.current.push(setTimeout(() => sb.exec(l), DELAY * (i + (before ? 1 : 0.3))));
    });
    timers.current.push(
      setTimeout(() => {
        setPlaying(false);
        setPlayed((p) => ({ ...p, [index]: true }));
      }, DELAY * (lines.length + (before ? 1 : 0.3)) + 100),
    );
  };

  const goTo = (k: number) => {
    timers.current.forEach(clearTimeout);
    setPlaying(false);
    setShowHint(false);
    const target = lesson.steps[k];
    if (k < index) sb.reset(worldAt(lesson, k), `Back to step ${k + 1}: the scene is set up as it was.`);
    else if (target.kind !== "read" && target.start) sb.reset(target.start(), "This step starts from a fresh scene.");
    else if (target.kind === "try" && target.enter) sb.apply(target.enter.apply(sb.world), `# ${target.enter.note}`);
    setIndex(k);
    onStep(k);
  };

  const finish = () => {
    setFinished(true);
    onComplete();
  };

  const cheats = lesson.cheats.map(cheatBySlug).filter((c): c is NonNullable<typeof c> => !!c);
  const complete = finished || (last && step.kind === "try" && goalMet);

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 py-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>/</span>}
              <Link href={c.href} className="hover:text-ink hover:underline">
                {c.label}
              </Link>
            </span>
          ))}
        </nav>
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{lesson.title}</h1>
          <p className="mt-1 text-[13px] text-ink-2">{lesson.summary}</p>
        </div>

        <ol className="flex gap-1" aria-label="Steps">
          {lesson.steps.map((s, i) => (
            <li key={i} className="flex-1">
              <button
                type="button"
                onClick={() => i <= index && goTo(i)}
                disabled={i > index}
                aria-current={i === index ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${s.title}`}
                title={s.title}
                className={`block h-1.5 w-full rounded-full transition-colors ${i < index ? "bg-[var(--lane-1)]" : i === index ? "bg-[var(--lane-0)]" : "bg-rule"} disabled:cursor-default`}
              />
            </li>
          ))}
        </ol>

        <section className="rounded-[var(--radius)] border border-rule bg-surface" aria-live="polite">
          <header className="flex items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
            <h2 className="text-[15px] font-semibold">{step.title}</h2>
            <span className="shrink-0 text-[12px] text-muted">
              {step.kind === "read" ? "Read" : step.kind === "watch" ? "Watch" : "Your turn"} · {index + 1}/{lesson.steps.length}
            </span>
          </header>
          <div className="px-4 py-3 text-[14px]">
            <Prose text={step.body} />
            {step.kind === "watch" && (
              <div className="mt-1 flex flex-col gap-2">
                <ol className="flex flex-col gap-1 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 font-mono text-[12.5px]">
                  {step.commands.map((c, i) => (
                    <li key={i}>$ {c}</li>
                  ))}
                </ol>
                <button
                  type="button"
                  disabled={playing}
                  onClick={() => playLines(step.commands, played[index] ? (step.start ? step.start() : worldAt(lesson, index)) : undefined)}
                  className="h-9 self-start rounded-[var(--radius-sm)] bg-[var(--lane-0)] px-3.5 text-[13px] font-medium text-white disabled:opacity-60"
                >
                  {playing ? "Playing…" : played[index] ? "Play again" : "Play"}
                </button>
              </div>
            )}
            {step.kind === "try" && (
              <div className="mt-1 flex flex-col gap-2">
                <p className={`flex items-start gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] ${goalMet ? "bg-ok-soft text-ok" : "bg-info-soft text-ink"}`}>
                  <span aria-hidden className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${goalMet ? "border-[var(--ok)] bg-[var(--ok)] text-white" : "border-rule-strong"}`}>
                    {goalMet && (
                      <svg viewBox="0 0 12 12" className="size-2.5">
                        <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>
                    <span className="sr-only">{goalMet ? "Done: " : "Goal: "}</span>
                    {step.goal}
                  </span>
                </p>
                {!goalMet && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setShowHint((h) => !h)} className="h-8 rounded-[var(--radius-sm)] border border-rule-strong px-2.5 text-[12.5px] hover:bg-surface-2" aria-expanded={showHint}>
                      {showHint ? "Hide hint" : "Hint"}
                    </button>
                    <button
                      type="button"
                      disabled={playing}
                      onClick={() => playLines(step.answer, step.start ? step.start() : sb.world)}
                      className="h-8 rounded-[var(--radius-sm)] border border-rule-strong px-2.5 text-[12.5px] hover:bg-surface-2 disabled:opacity-50"
                    >
                      Show me
                    </button>
                  </div>
                )}
                {showHint && !goalMet && <p className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 font-mono text-[12.5px]">{step.hint}</p>}
              </div>
            )}
          </div>
          <footer className="flex items-center gap-2 border-t border-rule px-4 py-2.5">
            <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} className="h-8 rounded-[var(--radius-sm)] px-2.5 text-[13px] text-ink-2 hover:bg-surface-2 disabled:opacity-40">
              Back
            </button>
            <span className="flex-1" />
            {!last ? (
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                disabled={step.kind === "try" && !goalMet}
                className="h-8 rounded-[var(--radius-sm)] bg-ink px-3.5 text-[13px] font-medium text-surface disabled:opacity-40"
              >
                {step.kind === "watch" && !played[index] ? "Skip" : "Next"}
              </button>
            ) : step.kind !== "try" && !finished ? (
              <button type="button" onClick={finish} className="h-8 rounded-[var(--radius-sm)] bg-ink px-3.5 text-[13px] font-medium text-surface">
                Finish
              </button>
            ) : null}
          </footer>
        </section>

        {complete && (
          <section className="rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-ok-soft px-4 py-3">
            <h2 className="text-[15px] font-semibold text-ok">{completeTitle}</h2>
            <p className="mt-1 text-[13px] text-ink-2">Keep experimenting in the panel, or move on.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {next && (
                <Link href={next.href} className="inline-flex h-8 items-center rounded-[var(--radius-sm)] bg-ink px-3 text-[13px] font-medium text-surface">
                  Next: {next.label}
                </Link>
              )}
              <Link href={crumbs[crumbs.length - 1]?.href ?? "/learn"} className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-rule-strong bg-surface px-3 text-[13px]">
                Back to the list
              </Link>
            </div>
          </section>
        )}

        {cheats.length > 0 && (
          <section className="rounded-[var(--radius)] border border-rule bg-surface px-4 py-3">
            <h2 className="text-[12.5px] font-medium text-ink-2">Cheat codes in this {crumbs[0]?.label === "Fix a mistake" ? "drill" : "lesson"}</h2>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {cheats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/cheats/${c.slug}`} className="inline-block rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[12px] text-ink-2 hover:text-ink hover:underline">
                    {c.command}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(prev || next) && (
          <nav aria-label="Lesson navigation" className="flex justify-between gap-2 text-[12.5px]">
            {prev ? (
              <Link href={prev.href} className="text-ink-2 hover:text-ink hover:underline">
                Previous: {prev.label}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={next.href} className="text-right text-ink-2 hover:text-ink hover:underline">
                Next: {next.label}
              </Link>
            )}
          </nav>
        )}
      </div>
      <Workbench sb={sb} terminalHeight="h-[min(40dvh,360px)] min-h-52" compact />
    </div>
  );
}
