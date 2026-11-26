import { MODULES, lessonKey } from "./modules";
import { MISTAKES } from "./mistakes";

export interface Ref {
  href: string;
  title: string;
  kind: "lesson" | "mistake";
  key: string;
}

/** Where each cheat code is taught: lessons and mistake drills that list it. */
export function cheatRefs(slug: string): Ref[] {
  const out: Ref[] = [];
  for (const m of MODULES)
    for (const l of m.lessons)
      if (l.cheats.includes(slug)) out.push({ href: `/learn/${m.slug}/${l.slug}`, title: l.title, kind: "lesson", key: lessonKey(m.slug, l.slug) });
  for (const d of MISTAKES) if (d.cheats.includes(slug)) out.push({ href: `/mistakes/${d.slug}`, title: d.title, kind: "mistake", key: d.slug });
  return out;
}
