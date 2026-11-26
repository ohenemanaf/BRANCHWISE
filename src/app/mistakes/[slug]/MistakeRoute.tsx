"use client";

import { useCallback } from "react";
import { MISTAKES, mistakeBySlug } from "@/content/mistakes";
import { completeMistake } from "@/lib/progress";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";

export function MistakeRoute({ slug }: { slug: string }) {
  const m = mistakeBySlug(slug)!;
  const i = MISTAKES.indexOf(m);
  const link = (k: number) => (MISTAKES[k] ? { href: `/mistakes/${MISTAKES[k].slug}`, label: MISTAKES[k].title } : null);
  const onComplete = useCallback(() => completeMistake(slug), [slug]);
  const noop = useCallback(() => {}, []);
  return (
    <LessonPlayer
      lesson={m}
      savedStep={0}
      crumbs={[{ href: "/mistakes", label: "Fix a mistake" }]}
      prev={link(i - 1)}
      next={link(i + 1)}
      onStep={noop}
      onComplete={onComplete}
      completeTitle="Fixed"
    />
  );
}
