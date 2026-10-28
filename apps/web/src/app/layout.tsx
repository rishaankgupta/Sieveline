import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sieveline", template: "%s · Sieveline" },
  description:
    "Find small businesses worth buying. Sieveline researches the web, checks every company against your rules with proof, and gives you a short list you can talk to.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#12130f" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:bg-[var(--color-surface)] focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
