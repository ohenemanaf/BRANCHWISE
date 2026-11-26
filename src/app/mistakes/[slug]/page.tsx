import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
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

async function Drill({ params }: { params: Params }) {
  const { slug } = await params;
  if (!mistakeBySlug(slug)) notFound();
  return <MistakeRoute slug={slug} />;
}

export default function MistakePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-muted">Loading drill…</div>}>
      <Drill params={params} />
    </Suspense>
  );
}
