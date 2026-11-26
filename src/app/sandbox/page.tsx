import type { Metadata } from "next";
import { SandboxApp } from "./SandboxApp";

export const metadata: Metadata = {
  title: "Sandbox",
  description: "A free-play Git and GitHub sandbox. Type real commands and watch the commit graph, branches and HEAD change.",
};

export default function SandboxPage() {
  return <SandboxApp />;
}
