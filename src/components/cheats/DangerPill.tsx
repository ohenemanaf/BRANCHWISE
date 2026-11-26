import { DANGER_LABEL, type Danger } from "@/content/cheats";

const STYLE: Record<Danger, string> = {
  safe: "bg-surface-2 text-muted",
  careful: "bg-warn-soft text-warn",
  rewrites: "bg-info-soft text-[var(--lane-3)]",
  destroys: "bg-bad-soft text-bad",
};

export function DangerPill({ danger }: { danger: Danger }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] ${STYLE[danger]}`}>{DANGER_LABEL[danger]}</span>;
}
