import type { Metadata } from "next";
import { MistakesIndex } from "./MistakesIndex";

export const metadata: Metadata = {
  title: "Fix a mistake",
  description: "Committed to the wrong branch? Lost a commit to reset --hard? Pushed something bad? Pick what happened and practise the fix on a safe copy.",
};

export default function MistakesPage() {
  return <MistakesIndex />;
}
