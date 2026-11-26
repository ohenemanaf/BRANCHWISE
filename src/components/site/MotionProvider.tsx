"use client";

import { LazyMotion, domAnimation } from "motion/react";
import type { ReactNode } from "react";

/** Motion's animation features for the `m.*` components. Not strict: the lazily loaded rebase editor uses full `motion` (Reorder) for drag. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      {children}
    </LazyMotion>
  );
}
