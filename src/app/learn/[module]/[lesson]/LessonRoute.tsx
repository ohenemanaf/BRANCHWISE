"use client";

import { useCallback, useState } from "react";
import { ALL_LESSONS, findLesson, lessonKey } from "@/content/modules";
import { completeLesson, peekProgress, setLessonStep, useHydrated } from "@/lib/progress";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";

export function LessonRoute({ moduleSlug, lessonSlug }: { moduleSlug: string; lessonSlug: string }) {
  const found = findLesson(moduleSlug, lessonSlug)!;
  const key = lessonKey(moduleSlug, lessonSlug);
  const hydrated = useHydrated();
  // Read the saved step once per mount, at hydration. Only a real resume remounts the
  // player; a first visit keeps the server-rendered DOM (no repaint, better LCP).
  // (The snapshot is taken at mount but only used once hydrated, so the hydration render matches the server.)
  const [atMount] = useState(() => (typeof window === "undefined" ? null : peekProgress().lessons[key]));
  const resumeStep = hydrated && atMount && !atMount.done ? atMount.step : 0;
  const pos = ALL_LESSONS.findIndex((x) => x.module.slug === moduleSlug && x.lesson.slug === lessonSlug);
  const link = (i: number) => {
    const x = ALL_LESSONS[i];
    return x ? { href: `/learn/${x.module.slug}/${x.lesson.slug}`, label: x.lesson.title } : null;
  };
  const onStep = useCallback((i: number) => setLessonStep(key, i), [key]);
  const onComplete = useCallback(() => completeLesson(key), [key]);
  return (
    <LessonPlayer
      key={`${key}:${resumeStep > 0 ? "resume" : "fresh"}`}
      lesson={found.lesson}
      savedStep={resumeStep}
      crumbs={[
        { href: "/learn", label: "Learn" },
        { href: `/learn#m-${moduleSlug}`, label: found.module.title },
      ]}
      prev={link(pos - 1)}
      next={link(pos + 1)}
      onStep={onStep}
      onComplete={onComplete}
      completeTitle="Lesson complete"
    />
  );
}
