"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { run } from "@/engine/run";
import type { World } from "@/engine/types";
import { started } from "@/content/worlds";
import { GraphView } from "@/components/graph/GraphView";
import { columnOrder, newLaneMemory } from "@/viz/layout";

const SCRIPT = [
  "git switch -c search",
  'git commit --allow-empty -m "Add search box"',
  'git commit --allow-empty -m "Show results"',
  "git switch main",
  'git commit --allow-empty -m "Fix typo"',
  "git merge search",
  "git branch -d search",
];

function build(): World[] {
  const out: World[] = [started()];
  for (const line of SCRIPT) out.push(run(out[out.length - 1], line).world);
  return out;
}

/** A looping, real-engine demo for the landing page. Pauses on hover/focus and for reduced motion. */
export function HeroDemo() {
  const reduce = useReducedMotion();
  const [frames] = useState(build);
  const [i, setI] = useState(reduce ? frames.length - 1 : 0);
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(0);
  // lanes stay put within one loop; a fresh memory per loop restarts the layout cleanly
  const [memories] = useState(() => new Map<number, ReturnType<typeof newLaneMemory>>());
  if (!memories.has(loop)) memories.set(loop, newLaneMemory());
  const mem = memories.get(loop)!;
  const world = frames[i];
  const cols = useMemo(() => columnOrder([frames[frames.length - 1].repos.local]), [frames]);

  useEffect(() => {
    if (reduce || paused) return;
    const t = setTimeout(
      () => {
        if (i >= frames.length - 1) {
          setLoop((l) => l + 1);
          setI(0);
        } else setI(i + 1);
      },
      i >= frames.length - 1 ? 3200 : 1500,
    );
    return () => clearTimeout(t);
  }, [i, reduce, paused, frames.length]);

  const command = i > 0 ? SCRIPT[i - 1] : "# a project with three commits";
  return (
    <figure
      className="overflow-hidden rounded-[14px] border border-rule bg-surface"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div key={loop} className="min-h-[168px]">
        <GraphView repo={world.repos.local} cols={cols} memory={mem} showUnreachable={false} title="A branch, a fix on main, then a merge" compact />
      </div>
      <figcaption className="flex items-center gap-2 bg-term-bg px-4 py-2.5 font-mono text-[12.5px] text-[var(--term-ink)]">
        <span className="text-[var(--term-ok)]">$</span>
        <span className="truncate" aria-live="off">
          {command}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-[var(--term-muted)]">
          {reduce ? "final state" : paused ? "paused" : `${i}/${SCRIPT.length}`}
        </span>
      </figcaption>
    </figure>
  );
}
