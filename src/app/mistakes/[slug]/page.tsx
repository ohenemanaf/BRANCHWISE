import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MISTAKES, mistakeBySlug } from "@/content/mistakes";
import { MistakeRoute } from "./MistakeRoute";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return MISTAKES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const m = mistakeBySlug(slug);
  return m ? { title: m.title, description: `${m.symptom} ${m.summary}` } : {};
}

export default async function MistakePage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!mistakeBySlug(slug)) notFound();
  return <MistakeRoute slug={slug} />;
}
