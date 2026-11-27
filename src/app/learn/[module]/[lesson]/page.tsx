import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MODULES, findLesson } from "@/content/modules";
import { LessonRoute } from "./LessonRoute";

type Params = Promise<{ module: string; lesson: string }>;

export function generateStaticParams() {
  return MODULES.flatMap((m) => m.lessons.map((l) => ({ module: m.slug, lesson: l.slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { module, lesson } = await params;
  const found = findLesson(module, lesson);
  return found ? { title: found.lesson.title, description: found.lesson.summary } : {};
}

export default async function LessonPage({ params }: { params: Params }) {
  const { module, lesson } = await params;
  if (!findLesson(module, lesson)) notFound();
  return <LessonRoute moduleSlug={module} lessonSlug={lesson} />;
}
