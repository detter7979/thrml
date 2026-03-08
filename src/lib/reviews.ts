import { sendHostNewReviewEmail } from "@/lib/emails"

export const SUB_RATING_KEYS = ["cleanliness", "accuracy", "communication", "value"] as const
export type SubRatingKey = (typeof SUB_RATING_KEYS)[number]
export type SubRatings = Partial<Record<SubRatingKey, number>>

export const REVIEW_TONE_BY_RATING: Record<number, string> = {
  1: "Terrible",
  2: "Poor",
  3: "Okay",
  4: "Great",
  5: "Exceptional",
}

export function clampRating(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.round(parsed)
  if (rounded < 1 || rounded > 5) return null
  return rounded
}

export function normalizeSubRatings(value: unknown): SubRatings {
  if (!value || typeof value !== "object") return {}
  const obj = value as Record<string, unknown>
  const normalized: SubRatings = {}

  for (const key of SUB_RATING_KEYS) {
    const rating = clampRating(obj[key])
    if (rating) normalized[key] = rating
  }

  return normalized
}

export function normalizePhotoUrls(value: unknown, max = 3): string[] {
  if (!Array.isArray(value)) return []
  const urls = value
    .filter((item): item is string => typeof item === "string")
    .map((url) => url.trim())
    .filter((url) => Boolean(url))
  return urls.slice(0, max)
}

export function extractServiceIcon(serviceType: string | null) {
  const key = (serviceType ?? "sauna").toLowerCase()
  if (key === "cold_plunge") return "🧊"
  if (key === "float_tank") return "🛁"
  if (key === "cryotherapy") return "❄️"
  if (key === "infrared_light") return "🔴"
  if (key === "contrast_therapy") return "♨️"
  if (key === "pemf") return "⚡"
  if (key === "hyperbaric") return "🫧"
  if (key === "halotherapy") return "🌬️"
  return "🔥"
}

export function formatSessionDate(date: string | null) {
  if (!date) return "Date TBD"
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return "Date TBD"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed)
}

export function firstName(value: string | null | undefined) {
  const normalized = (value ?? "").trim()
  if (!normalized) return "your host"
  return normalized.split(" ")[0] ?? "your host"
}

type ReviewEmailArgs = {
  hostEmail: string | null
  hostFirstName: string | null
  guestFirstName: string | null
  listingTitle: string | null
  bookingId: string
  listingId: string | null
  ratingOverall: number
}

export async function sendHostReviewNotificationEmail(args: ReviewEmailArgs) {
  await sendHostNewReviewEmail({
    hostId: null,
    hostEmail: args.hostEmail,
    hostFirstName: args.hostFirstName,
    guestFirstName: args.guestFirstName,
    listingTitle: args.listingTitle ?? "your listing",
    listingId: args.listingId ?? "",
    ratingOverall: args.ratingOverall,
    comment: null,
    ratingCleanliness: null,
    ratingAccuracy: null,
    ratingCommunication: null,
    ratingValue: null,
  })
}
