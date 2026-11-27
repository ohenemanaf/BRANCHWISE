import { expect, test, type Page } from "@playwright/test";

async function type(page: Page, line: string) {
  const input = page.locator("#term-input");
  await input.fill(line);
  await input.press("Enter");
}

test("sandbox: a ten-command session drives the graph", async ({ page }) => {
  await page.goto("/sandbox?preset=blank");
  const lines = [
    "git init",
    'echo "hello" > README.md',
    "git add README.md",
    'git commit -m "First"',
    "git switch -c idea",
    'echo "x" > idea.txt',
    "git add .",
    'git commit -m "Idea"',
    "git switch main",
    "git merge idea",
  ];
  for (const l of lines) await type(page, l);
  const log = page.getByRole("log", { name: "Terminal output" });
  await expect(log).toContainText("Fast-forward");
  await expect(page.getByRole("button", { name: /Commit [0-9a-f]{7}: Idea/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /2 commits, branches idea, main/ })).toBeVisible();
  // undo steps back one change
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#term-input")).toBeEnabled();
});

test("learn: finish the first lesson by typing the commands", async ({ page }) => {
  await page.goto("/learn/git-basics/first-commit");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("log", { name: "Terminal output" })).toContainText("Initialized empty Git repository", { timeout: 5000 });
  await page.getByRole("button", { name: "Next" }).click();
  await type(page, 'echo "# Recipe box" > README.md');
  await type(page, "git add README.md");
  await type(page, 'git commit -m "Add README"');
  await expect(page.getByText("The repository has one commit that contains README.md")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await type(page, 'echo "more" >> README.md');
  await type(page, 'git commit -am "More"');
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  // progress shows on the index
  await page.goto("/learn");
  await expect(page.getByText(/1 of \d+ lessons done/)).toBeVisible();
});

test("mistakes: the recovery plays and the fix is checked", async ({ page }) => {
  await page.goto("/mistakes/typo-in-commit-message");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("log", { name: "Terminal output" })).toContainText("Add crepes", { timeout: 5000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await type(page, 'git commit --amend -m "Add crepes"');
  await expect(page.getByRole("heading", { name: "Fixed" })).toBeVisible();
});

test("cheats: search by intent", async ({ page }) => {
  await page.goto("/cheats");
  await page.getByRole("searchbox", { name: "Search cheat codes" }).fill("undo last commit");
  await expect(page.getByRole("link", { name: /Undo commits, keep the changes staged/ })).toBeVisible();
  await page.getByRole("link", { name: /Undo commits, keep the changes staged/ }).click();
  await expect(page.getByRole("heading", { name: "Undo commits, keep the changes staged" })).toBeVisible();
});

for (const path of ["/", "/learn", "/sandbox", "/mistakes", "/cheats", "/learn/branching/merging"]) {
  test(`no horizontal page scroll on ${path}`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
