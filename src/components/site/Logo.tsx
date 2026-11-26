/** Two transit lines splitting from one station and meeting again: a branch and a merge. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 16h18" stroke="var(--lane-0)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6 16c3 0 3-8 6-8s3 8 6 8" fill="none" stroke="var(--lane-1)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="6" cy="16" r="2.6" fill="var(--surface)" stroke="var(--lane-0)" strokeWidth="2" />
      <circle cx="12" cy="8" r="2.6" fill="var(--surface)" stroke="var(--lane-1)" strokeWidth="2" />
      <circle cx="18" cy="16" r="2.6" fill="var(--surface)" stroke="var(--lane-0)" strokeWidth="2" />
    </svg>
  );
}
