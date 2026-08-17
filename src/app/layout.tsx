import type { Metadata } from "next";
import { Instrument_Serif, Inter_Tight, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";

/**
 * Three faces, three jobs.
 *
 * Instrument Serif says the sentences that are meant to sound like a person
 * wrote them. Inter Tight carries the reading text. IBM Plex Mono sets every
 * number, date, coefficient and sample size, because a monospaced figure
 * reads as a measurement and keeps columns of them aligned.
 */
const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const body = Inter_Tight({
  variable: "--font-body",
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
  title: "Slept On — your skin is reacting to your sleep, not your serum",
  description:
    "A skin notebook built on the YouCam Skin Analysis API. Photograph your face on a schedule, log the boring things next to it, and find out which ones actually track with your skin over weeks. Every claim carries its sample size, and every p-value is corrected for the 147 tests it took to find it.",
  openGraph: {
    title: "Slept On",
    description:
      "Your skin isn't reacting to your serum. It's reacting to your sleep. 147 tests run, every one of them counted.",
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
      className={`${display.variable} ${body.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full font-sans">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
