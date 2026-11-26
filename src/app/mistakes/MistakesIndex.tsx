"use client";

import Link from "next/link";
import { MISTAKES } from "@/content/mistakes";
import { useProgress } from "@/lib/progress";
import { Check } from "@/components/ui/Check";

export function MistakesIndex() {
  const progress = useProgress();
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-8">
      <h1 className="text-[26px] font-semibold tracking-tight">What went wrong?</h1>
      <p className="mt-1 max-w-[62ch] text-[14px] text-ink-2">
        Pick the one that matches. Each drill recreates the situation, shows the recovery step by step, then resets so you can fix it yourself. Nothing here touches a real repository.
      </p>
      <ul className="mt-6 flex flex-col divide-y divide-rule overflow-hidden rounded-[var(--radius)] border border-rule bg-surface">
        {MISTAKES.map((m) => (
          <li key={m.slug}>
            <Link href={`/mistakes/${m.slug}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
              <span className="mt-0.5">
                <Check done={!!progress.mistakes[m.slug]} small />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium">{m.title}</span>
                <span className="block text-[13px] text-ink-2">{m.symptom}</span>
                <span className="mt-1 block text-[12.5px] text-muted">Fix: {m.summary}</span>
              </span>
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11.5px] ${m.scope === "pushed" ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted"}`}>
                {m.scope === "pushed" ? "Already pushed" : "Only on your computer"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13px] text-ink-2">
        Rule of thumb: if the mistake is <strong className="font-medium text-ink">only on your computer</strong>, you can rewrite it (reset, amend, rebase). Once it&apos;s <strong className="font-medium text-ink">pushed and shared</strong>, add a fix on top (revert) instead.
      </p>
    </div>
  );
}
