import type { Lesson, Module } from "./types";
import { basics } from "./lessons/basics";
import { branching } from "./lessons/branching";
import { github } from "./lessons/github";
import { advanced } from "./lessons/advanced";

/** The learning path. Module 4 ("Fixing mistakes") is the drill library, linked from /learn. */
export const MODULES: Module[] = [basics, branching, github, advanced];

export function findLesson(moduleSlug: string, lessonSlug: string): { module: Module; lesson: Lesson; index: number } | null {
  const mod = MODULES.find((m) => m.slug === moduleSlug);
  const index = mod?.lessons.findIndex((l) => l.slug === lessonSlug) ?? -1;
  if (!mod || index < 0) return null;
  return { module: mod, lesson: mod.lessons[index], index };
}

/** Every lesson in path order, for prev/next links. */
export const ALL_LESSONS = MODULES.flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })));

export const lessonKey = (moduleSlug: string, lessonSlug: string) => `${moduleSlug}/${lessonSlug}`;
