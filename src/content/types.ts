import type { World } from "@/engine/types";

export type Step =
  | { kind: "read"; title: string; body: string }
  | {
      kind: "watch";
      title: string;
      body: string;
      commands: string[];
      /** Commands that are expected to fail (e.g. showing a rejected push). */
      failing?: string[];
      /** Reset the world before playing. */
      start?: () => World;
    }
  | {
      kind: "try";
      title: string;
      body: string;
      /** Plain-language description of the goal shown as a checklist line. */
      goal: string;
      check: (w: World) => boolean;
      hint: string;
      /** Commands that solve it (shown on "Show me", and run by the tests). */
      answer: string[];
      /** Reset the world when the step opens. */
      start?: () => World;
      /** Transform the current world when the step opens (e.g. a teammate acts). */
      enter?: { note: string; apply: (w: World) => World };
    };

export interface Lesson {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  start: () => World;
  steps: Step[];
  /** Cheat-code slugs this lesson teaches. */
  cheats: string[];
  /** Related mistake scenarios. */
  mistakes?: string[];
}

export interface Module {
  slug: string;
  title: string;
  summary: string;
  lessons: Lesson[];
}
