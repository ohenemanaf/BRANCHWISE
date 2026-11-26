import type { Metadata } from "next";
import { CheatsIndex } from "./CheatsIndex";

export const metadata: Metadata = {
  title: "Cheat codes",
  description: "A searchable Git and GitHub CLI reference. Search by command or by what you want to do, like \"undo last commit\".",
};

export default function CheatsPage() {
  return <CheatsIndex />;
}
