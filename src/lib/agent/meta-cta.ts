const CTA_TO_META_ENUM: Record<string, string> = {
  "Book Now": "BOOK_TRAVEL",
  "Find Your Space": "LEARN_MORE",
  "Reserve Your Hour": "BOOK_TRAVEL",
  "Explore Spaces": "LEARN_MORE",
  "See What's Near You": "LEARN_MORE",
  "Learn More": "LEARN_MORE",
  "Get Started": "LEARN_MORE",
}

export function ctaToMetaEnum(cta: string | null | undefined): string {
  const value = cta?.trim() || "Book Now"
  const metaEnum = CTA_TO_META_ENUM[value]
  if (metaEnum) return metaEnum
  console.warn("[meta-cta] unknown CTA, defaulting to LEARN_MORE:", value)
  return "LEARN_MORE"
}
