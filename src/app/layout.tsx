import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleTagLoader } from "@/components/analytics/google-tag-loader";
import { CookieConsent } from "@/components/cookie-consent";
import { MetaPixel } from "@/components/meta-pixel";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://usethrml.com"),
  title: {
    default: "thrml — Book Private Wellness Spaces",
    template: "%s | thrml",
  },
  description:
    "thrml is a peer-to-peer marketplace to book private saunas, cold plunges, float tanks, infrared therapy, and more — hosted by real people in Seattle and Los Angeles.",
  openGraph: {
    type: "website",
    siteName: "thrml",
    title: "thrml — Book Private Saunas, Cold Plunges & Wellness Spaces",
    description:
      "Book private saunas, cold plunges, float tanks and more — hosted by people in your city. No memberships. No front desks.",
    url: "https://usethrml.com",
    images: [
      {
        url: "https://usethrml.com/opengraph-image",
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
    images: ["https://usethrml.com/opengraph-image"],
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
        className={`${dmSans.variable} ${dmSerifDisplay.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#1A1410] focus:shadow-lg"
        >
          Skip to main content
        </a>
        {children}
        <Script
          id="ga-consent-default"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push(['consent', 'default', {
                analytics_storage: 'denied',
                wait_for_update: 2000
              }]);
            `,
          }}
        />
        <GoogleTagLoader />
        <MetaPixel />
        <CookieConsent />
        <SpeedInsights />
      </body>
    </html>
  );
}
