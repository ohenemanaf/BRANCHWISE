/** Progress marker: a numbered station that fills in when done. */
export function Check({ done, started, label, small }: { done: boolean; started?: boolean; label?: string; small?: boolean }) {
  const size = small ? "size-4" : "size-6";
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-full border-2 font-mono text-[11px] ${
        done ? "border-[var(--lane-1)] bg-[var(--lane-1)] text-white" : started ? "border-[var(--lane-0)] text-[var(--lane-0)]" : "border-rule-strong text-muted"
      }`}
    >
      {done ? (
        <svg viewBox="0 0 12 12" className={small ? "size-2" : "size-3"} aria-hidden>
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        !small && label
      )}
      <span className="sr-only">{done ? "Done" : started ? "In progress" : "Not started"}</span>
    </span>
  );
}
