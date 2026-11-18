/** Review constants safe to import from client components (no server-only dependencies). */
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
