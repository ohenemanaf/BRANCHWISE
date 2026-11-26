import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://branchwise.vercel.app"),
  title: { default: "Branchwise: see what Git is doing", template: "%s · Branchwise" },
  description:
    "Learn Git and GitHub by watching every command move the commit graph. Lessons, a live sandbox, mistake-recovery drills and a searchable cheat sheet. Free, no sign-up.",
  openGraph: { type: "website", siteName: "Branchwise" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e131b" },
  ],
};

const themeScript = `try{var t=localStorage.getItem("bw-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Suspense fallback={<div className="h-12 border-b border-rule bg-surface" />}>
          <SiteHeader />
        </Suspense>
        <main id="main" className="flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
