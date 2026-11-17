import Image from "next/image"
import Link from "next/link"

import type { ListingCardData } from "@/components/listings/ListingCard"
import { guestListingHref, guestPlaceLabel, guestPriceLabel } from "@/lib/marketing/guest-landing"
import { listingCardCoverUrl } from "@/lib/listings/thumbnail-url"

function tileFrame(index: number) {
  const slot = index % 4
  if (slot === 0) return { span: "md:col-span-7", aspect: "aspect-[5/4]" }
  if (slot === 1) return { span: "md:col-span-5 md:mt-20", aspect: "aspect-[3/4]" }
  if (slot === 2) return { span: "md:col-span-5", aspect: "aspect-[3/4]" }
  return { span: "md:col-span-7 md:mt-14", aspect: "aspect-[5/4]" }
}

export function GuestSpaceMosaic({
  listings,
  fromPath,
  heading,
  lede,
}: {
  listings: ListingCardData[]
  fromPath: string
  heading?: string
  lede?: string
}) {
  if (!listings.length) return null

  return (
    <section className={`mx-auto max-w-6xl px-5 md:px-8 ${heading ? "py-16 md:py-24" : "pb-16 md:pb-24"}`}>
      {heading ? (
        <div className="max-w-md">
          <h2 className="font-serif text-3xl leading-tight text-[#1A1410] md:text-4xl">{heading}</h2>
          {lede ? <p className="mt-3 text-lg text-[#5c5148]">{lede}</p> : null}
        </div>
      ) : (
        <h2 className="sr-only">More saunas</h2>
      )}
      <ul className={`grid grid-cols-1 gap-y-16 md:grid-cols-12 md:gap-x-10 md:gap-y-6 ${heading ? "mt-12" : ""}`}>
        {listings.map((listing, index) => {
          const frame = tileFrame(index)
          const place = guestPlaceLabel(listing)
          const price = guestPriceLabel(listing)
          const src = listingCardCoverUrl(listing.photoUrl) || listing.photoUrl || ""
          return (
            <li key={listing.id} className={frame.span}>
              <Link
                href={guestListingHref(listing.id, fromPath)}
                className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C75B3A]"
              >
                <div className={`relative overflow-hidden ${frame.aspect}`}>
                  <Image
                    src={src}
                    alt={place ? `${listing.title} in ${place}` : listing.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover motion-safe:transition motion-safe:duration-700 motion-safe:group-hover:scale-[1.03]"
                  />
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-2xl text-[#1A1410]">{listing.title}</p>
                    {place ? <p className="mt-1 text-sm text-[#6b5346]">{place}</p> : null}
                  </div>
                  {price ? <p className="shrink-0 text-sm text-[#1A1410]">{price}</p> : null}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
