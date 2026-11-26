"use client";

import { useCallback } from "react";
import { ALL_LESSONS, findLesson, lessonKey } from "@/content/modules";
import { completeLesson, setLessonStep, useHydrated, useProgress } from "@/lib/progress";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";

export function LessonRoute({ moduleSlug, lessonSlug }: { moduleSlug: string; lessonSlug: string }) {
  const found = findLesson(moduleSlug, lessonSlug)!;
  const key = lessonKey(moduleSlug, lessonSlug);
  const progress = useProgress();
  const hydrated = useHydrated();
  const saved = progress.lessons[key];
  const pos = ALL_LESSONS.findIndex((x) => x.module.slug === moduleSlug && x.lesson.slug === lessonSlug);
  const link = (i: number) => {
    const x = ALL_LESSONS[i];
    return x ? { href: `/learn/${x.module.slug}/${x.lesson.slug}`, label: x.lesson.title } : null;
  };
  const onStep = useCallback((i: number) => setLessonStep(key, i), [key]);
  const onComplete = useCallback(() => completeLesson(key), [key]);
  return (
    <LessonPlayer
      // remount once, when stored progress becomes readable after hydration
      key={`${key}:${hydrated ? "client" : "server"}`}
      lesson={found.lesson}
      savedStep={saved && !saved.done ? saved.step : 0}
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
