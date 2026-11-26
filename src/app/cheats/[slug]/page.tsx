import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CHEATS, cheatBySlug } from "@/content/cheats";
import { cheatRefs } from "@/content/links";
import { DangerPill } from "@/components/cheats/DangerPill";
import { CopyButton } from "@/components/cheats/CopyButton";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return CHEATS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const c = cheatBySlug(slug);
  return c ? { title: `${c.command}: ${c.title}`, description: c.summary } : {};
}

export default async function CheatPage({ params }: { params: Params }) {
  const { slug } = await params;
  const c = cheatBySlug(slug);
  if (!c) notFound();
  const refs = cheatRefs(c.slug);
  const related = CHEATS.filter((x) => x.group === c.group && x.slug !== c.slug).slice(0, 6);
  return (
    <article className="mx-auto w-full max-w-[760px] px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-muted">
        <Link href="/cheats" className="hover:text-ink hover:underline">
          Cheat codes
        </Link>{" "}
        / {c.group}
      </nav>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight">{c.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-[var(--radius-sm)] bg-term-bg px-3 py-1.5 font-mono text-[14px] text-[var(--term-ink)]">{c.command}</code>
        <CopyButton text={c.command} />
        <DangerPill danger={c.danger} />
        {c.simulated === false && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted">Real Git only, not in the sandbox</span>}
      </div>
      <p className="mt-4 max-w-[64ch] text-[15px] leading-relaxed">{c.summary}</p>
      {c.graph && (
        <p className="mt-3 max-w-[64ch] text-[14px] text-ink-2">
          <span className="font-medium text-ink">On the graph: </span>
          {c.graph}
        </p>
      )}
      {c.example && (
        <section className="mt-5">
          <h2 className="mb-1.5 text-[13px] font-medium text-ink-2">Example</h2>
          <pre className="overflow-x-auto rounded-[var(--radius)] bg-term-bg px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--term-ink)] scroll-thin">{c.example}</pre>
        </section>
      )}
      {c.simulated !== false && (
        <div className="mt-5">
          <Link href={`/sandbox?preset=${c.preset ?? "started"}`} className="inline-flex h-9 items-center rounded-[var(--radius-sm)] bg-ink px-3.5 text-[13px] font-medium text-surface">
            Try it in the sandbox
          </Link>
        </div>
      )}
      {refs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[15px] font-semibold">Where it&apos;s taught</h2>
          <ul className="divide-y divide-rule overflow-hidden rounded-[var(--radius)] border border-rule bg-surface">
            {refs.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px] hover:bg-surface-2">
                  {r.title}
                  <span className="text-[12px] text-muted">{r.kind === "lesson" ? "Lesson" : "Mistake drill"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[15px] font-semibold">More in {c.group}</h2>
          <ul className="flex flex-wrap gap-1.5">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/cheats/${r.slug}`} className="inline-block rounded-md bg-surface px-2 py-1 font-mono text-[12.5px] text-ink-2 ring-1 ring-rule hover:text-ink">
                  {r.command}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
