import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["opsz"],
});

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://revualy.com"),
  title: {
    default: "Revualy — AI-Powered Peer Review",
    template: "%s | Revualy",
  },
  description:
    "Continuous peer feedback that maps to your values. 2-3 micro-interactions per week, delivered through the chat tools your team already uses.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${outfit.variable}`}>
      <body className="min-h-screen bg-cream font-body text-stone-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
