import type { Metadata } from "next";
import { Inter_Tight, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";

/**
 * Two faces, two jobs.
 *
 * Inter Tight sets the prose — narrow, technical, unfussy. IBM Plex Mono
 * sets every number, date, coefficient and sample size, because in a
 * measurement log a monospaced figure signals "this is a reading" and
 * keeps columns of them aligned.
 */
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Skin Diary — find out what actually changed your skin",
  description:
    "A skin journal built on the YouCam Skin Analysis API. Photograph your face on a schedule, log the boring variables, and find out which ones actually track with your skin metrics over time — with the sample size printed next to every claim.",
  openGraph: {
    title: "Skin Diary",
    description:
      "Every skin app scores you once. Skin Diary tells you what changed your skin — with the sample size next to every claim.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full font-sans">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
