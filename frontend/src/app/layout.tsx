import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "LegacyMind | AI-Powered Legacy System Modernization",
  description:
    "AI agent swarm that analyzes, maps, and modernizes enterprise SAP/legacy codebases. Turns months of consulting into minutes of automated analysis.",
  keywords: ["SAP", "ABAP", "legacy modernization", "AI agents", "impact analysis"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
