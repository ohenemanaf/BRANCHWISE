import { describe, expect, it } from "vitest";
import { run } from "@/engine/run";
import type { World } from "@/engine/types";
import { MODULES } from "./modules";
import { MISTAKES } from "./mistakes";
import type { Lesson } from "./types";
import { CHEATS, searchCheats } from "./cheats";

/** Walk a lesson the way a learner who follows every hint would. */
function walk(lesson: Lesson) {
  let w: World = lesson.start();
  lesson.steps.forEach((step, i) => {
    const where = `${lesson.slug} step ${i + 1} (${step.title})`;
    if (step.kind === "read") return;
    if (step.start) w = step.start();
    if (step.kind === "watch") {
      for (const c of step.commands) {
        const r = run(w, c);
        const shouldFail = step.failing?.includes(c) ?? false;
        expect(r.ok, `${where}: "${c}" ${shouldFail ? "should fail" : "failed"}:\n${r.output.map((l) => l.text).join("\n")}`).toBe(!shouldFail);
        w = r.world;
      }
      return;
    }
    if (step.enter) w = step.enter.apply(w);
    expect(step.check(w), `${where}: goal is already met before the learner does anything`).toBe(false);
    for (const c of step.answer) {
      const r = run(w, c);
      w = r.world;
      // a command that stops on a conflict on purpose is allowed; the goal decides
    }
    expect(step.check(w), `${where}: the model answer doesn't reach the goal`).toBe(true);
  });
}

describe("lessons", () => {
  for (const m of MODULES)
    for (const l of m.lessons)
      it(`${m.slug}/${l.slug}`, () => {
        walk(l);
      });
});

describe("mistake drills", () => {
  for (const m of MISTAKES)
    it(m.slug, () => {
      walk(m);
    });
});

describe("content integrity", () => {
  it("slugs are unique", () => {
    const lessonSlugs = MODULES.flatMap((m) => m.lessons.map((l) => `${m.slug}/${l.slug}`));
    expect(new Set(lessonSlugs).size).toBe(lessonSlugs.length);
    expect(new Set(MISTAKES.map((m) => m.slug)).size).toBe(MISTAKES.length);
  });
  it("every cheat-code link resolves", () => {
    const known = new Set(CHEATS.map((c) => c.slug));
    expect(known.size).toBe(CHEATS.length);
    for (const l of [...MODULES.flatMap((m) => m.lessons), ...MISTAKES]) for (const s of l.cheats) expect(known.has(s), `${l.slug} -> ${s}`).toBe(true);
  });
  it("cheat search works by command and by plain-language intent", () => {
    expect(searchCheats("undo last commit").slice(0, 3).map((c) => c.slug)).toEqual(expect.arrayContaining(["git-reset-soft"]));
    expect(searchCheats("unstage")[0].slug).toBe("git-restore-staged");
    expect(searchCheats("cherry-pick")[0].slug).toBe("git-cherry-pick");
    expect(searchCheats("recover lost").map((c) => c.slug)).toContain("git-reflog");
    for (const c of CHEATS) expect(searchCheats(c.command).map((x) => x.slug), c.slug).toContain(c.slug);
  });
  it("lessons only link to mistakes that exist", () => {
    const known = new Set(MISTAKES.map((m) => m.slug));
    for (const m of MODULES) for (const l of m.lessons) for (const s of l.mistakes ?? []) expect(known.has(s), `${l.slug} -> ${s}`).toBe(true);
  });
});
