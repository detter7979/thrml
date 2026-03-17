import type { ReactNode } from "react"
import Link from "next/link"
import { Facebook, Instagram } from "lucide-react"

import { Navbar } from "@/components/shared/Navbar"

export default function MainLayout({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-warm-50">
      <Navbar />
      <main>{children}</main>
      <footer className="border-t border-white/10 bg-[#1A1410] text-white/75">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="space-y-3 md:col-span-1">
              <p className="font-serif text-3xl lowercase text-[#F5EFE8]">thrml</p>
              <p className="max-w-sm text-sm text-white/55">Private wellness marketplace.</p>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-[#F5EFE8]">Marketplace</p>
              <ul className="space-y-2 text-sm text-white/65">
                <li>
                  <Link
                    href={{
                      pathname: "/explore",
                      query: {
                        location: "Seattle, WA",
                        lat: "47.60620",
                        lng: "-122.33210",
                        distance: "50",
                        view: "split",
                      },
                    }}
                    className="transition-colors hover:text-white"
                  >
                    Explore spaces
                  </Link>
                </li>
                <li>
                  <Link href="/become-a-host" className="transition-colors hover:text-white">
                    List your space
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/bookings" className="transition-colors hover:text-white">
                    My bookings
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-[#F5EFE8]">Legal</p>
              <ul className="space-y-2 text-sm text-white/65">
                <li>
                  <Link href="/terms" className="transition-colors hover:text-white">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="transition-colors hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/disclaimer" className="transition-colors hover:text-white">
                    Disclaimers
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-[#F5EFE8]">Resources</p>
              <ul className="space-y-2 text-sm text-white/65">
                <li>
                  <Link href="/our-story" className="transition-colors hover:text-white">
                    Our story
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="transition-colors hover:text-white">
                    FAQs
                  </Link>
                </li>
                <li>
                  <Link href="/support" className="transition-colors hover:text-white">
                    Support
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-4 text-xs text-white/45 md:flex-row md:items-center md:justify-between">
            <p>&copy; {currentYear} thrml</p>
            <div className="flex items-center gap-2 md:justify-end">
              <a
                href="https://www.facebook.com/usethrml"
                target="_blank"
                rel="noreferrer"
                aria-label="Visit thrml on Facebook"
                className="inline-flex size-8 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/30 hover:text-white"
              >
                <Facebook className="size-4" />
              </a>
              <a
                href="https://www.instagram.com/usethrml"
                target="_blank"
                rel="noreferrer"
                aria-label="Visit thrml on Instagram"
                className="inline-flex size-8 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/30 hover:text-white"
              >
                <Instagram className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
