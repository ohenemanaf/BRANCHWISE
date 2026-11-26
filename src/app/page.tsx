import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <h1 className="text-[28px] font-semibold tracking-tight">Branchwise</h1>
      <p className="mt-2 text-ink-2">Learn Git by watching it work.</p>
      <Link href="/sandbox" className="mt-4 inline-block text-[var(--lane-0)] underline">
        Open the sandbox
      </Link>
    </div>
  );
}
