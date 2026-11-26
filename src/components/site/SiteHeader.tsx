"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

const NAV = [
  { href: "/learn", label: "Learn" },
  { href: "/sandbox", label: "Sandbox" },
  { href: "/mistakes", label: "Fix a mistake" },
  { href: "/cheats", label: "Cheat codes" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-2 px-4">
        <Link href="/" className="mr-3 flex items-center gap-2 font-semibold tracking-tight" aria-label="Branchwise home">
          <Logo />
          <span className="hidden sm:inline">Branchwise</span>
        </Link>
        <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scroll-thin">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  active ? "bg-info-soft font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <a
          href="https://github.com/ohenemanaf/BRANCHWISE"
          className="hidden rounded-md px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink md:block"
        >
          Source
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
