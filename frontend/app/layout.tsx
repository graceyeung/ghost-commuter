import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileNav } from "@/components/layout/MobileNav";
import { GhostBackdrop } from "@/components/layout/GhostBackdrop";
import { DemoBanner } from "@/components/layout/DemoBanner";

const display = Outfit({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"], display: "swap" });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], variable: "--font-body", weight: ["400", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Ghost Commuter: never commute home alone", template: "%s · Ghost Commuter" },
  description:
    "Ghost Commuter pairs London students on the same line and departure time for a walk home from the station or a study carriage on the way.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070c18" },
    { media: "(prefers-color-scheme: light)", color: "#f6f2e9" },
  ],
};

// Applies the saved theme before first paint (dark is the default) to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("ghost-commuter:theme");if(t==="light"){document.documentElement.classList.remove("dark")}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`dark ${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-amber focus:px-4 focus:py-3 focus:font-semibold focus:text-on-amber"
        >
          Skip to content
        </a>
        <Providers>
          <GhostBackdrop />
          <div className="relative flex min-h-dvh flex-col">
            <DemoBanner />
            <SiteHeader />
            <main id="main" tabIndex={-1} className="flex-1 pb-12 focus:outline-none">
              {children}
            </main>
            <SiteFooter />
            <MobileNav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
