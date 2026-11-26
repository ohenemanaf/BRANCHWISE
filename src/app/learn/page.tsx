import type { Metadata } from "next";
import { LearnIndex } from "./LearnIndex";

export const metadata: Metadata = {
  title: "Learn",
  description: "A path from your first commit to interactive rebase, bisect and GitHub Actions. Every lesson runs in a live, simulated repository.",
};

export default function LearnPage() {
  return <LearnIndex />;
}
