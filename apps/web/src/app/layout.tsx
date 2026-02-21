import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const manrope = Manrope({
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
    "Honest peer feedback through 2-3 micro-interactions per week, delivered through the chat tools your team already uses. No more rehearsed survey answers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-cream font-body text-stone-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
