import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/chrome/Nav";
import { SubscriptionBanner } from "@/components/chrome/SubscriptionBanner";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Threshold — probabilistic automation for DreamDEX Event Contracts",
  description:
    "A smart contract executes an action when a binary market's depth-weighted probability crosses a threshold and holds there. No keeper.",
};

export const viewport: Viewport = { themeColor: "#08090b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <Providers>
          <Nav />
          <SubscriptionBanner />
          <main className="mx-auto w-full max-w-[1200px] px-5 py-8">{children}</main>
          <footer className="mx-auto w-full max-w-[1200px] px-5 pb-10 pt-4 text-xs text-fg-4">
            Somnia Shannon testnet · not audited · manipulation is reduced, not eliminated
          </footer>
        </Providers>
      </body>
    </html>
  );
}
