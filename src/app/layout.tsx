import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { DM_Sans, DM_Serif_Display, Geist_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  weight: "400",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://usethrml.com"),
  title: {
    default: "thrml — Book Private Saunas, Cold Plunges & Wellness Spaces",
    template: "%s | thrml",
  },
  description:
    "thrml is a peer-to-peer marketplace to book private saunas, cold plunges, float tanks, infrared therapy, and more — hosted by real people in Seattle and Los Angeles.",
  keywords: [
    "private sauna rental",
    "cold plunge booking",
    "float tank near me",
    "infrared therapy session",
    "book wellness space",
    "private wellness rental",
    "sauna rental Seattle",
    "cold plunge Los Angeles",
    "biohacking near me",
    "contrast therapy booking",
  ],
  openGraph: {
    type: "website",
    siteName: "thrml",
    title: "thrml — Book Private Saunas, Cold Plunges & Wellness Spaces",
    description:
      "Book private saunas, cold plunges, float tanks and more — hosted by people in your city. No memberships. No front desks.",
    url: "https://usethrml.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "thrml — Private Wellness Spaces",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@usethrml",
    title: "thrml — Book Private Saunas, Cold Plunges & Wellness Spaces",
    description:
      "Book private saunas, cold plunges, float tanks and more — hosted by people in your city.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://usethrml.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${dmSerifDisplay.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <GoogleAnalytics gaId="G-L20J7S2M51" />
      </body>
    </html>
  );
}
