import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with bookings, listings, payments, and anything else on thrml.",
  alternates: { canonical: "https://usethrml.com/support" },
}

export default function SupportLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
