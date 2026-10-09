/**
 * Client-safe constants and types for organic social posts (no server imports),
 * shared by the generator, the admin API and the admin panel.
 */

export const SOCIAL_PILLARS = ["education", "social_proof", "host_spotlight", "offer_cta"] as const
export type SocialPillar = (typeof SOCIAL_PILLARS)[number]

export const SOCIAL_PLATFORMS = [
  { key: "instagram_reel", label: "Instagram Reel (9:16 vertical video)", format: "9x16" },
  { key: "tiktok_reel", label: "TikTok video (9:16)", format: "9x16" },
  { key: "twitter_thread", label: "X/Twitter thread (1-3 tweets, 280 chars each)", format: "thread" },
  { key: "instagram_static", label: "Instagram static post (1:1 image)", format: "1x1" },
] as const
export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number]["key"]

export const SOCIAL_STATUS = {
  draft: "social_draft",
  approved: "social_approved",
  rejected: "social_rejected",
  published: "published",
} as const

export type SocialTriggerData = {
  source: "agent-social" | "admin"
  platform: SocialPlatformKey
  pillar: SocialPillar
  hashtags: string[]
  listing_id?: string | null
  generated_for: string
}

export function isSocialPillar(v: unknown): v is SocialPillar {
  return typeof v === "string" && (SOCIAL_PILLARS as readonly string[]).includes(v)
}

export function isSocialPlatform(v: unknown): v is SocialPlatformKey {
  return typeof v === "string" && SOCIAL_PLATFORMS.some((p) => p.key === v)
}

// Mon/Thu=education, Tue/Fri=social_proof, Wed=host_spotlight, Sat/Sun=offer_cta
export function todaysPillar(date = new Date()): SocialPillar {
  const map: Record<number, SocialPillar> = {
    0: "offer_cta", 1: "education", 2: "social_proof",
    3: "host_spotlight", 4: "education", 5: "social_proof", 6: "offer_cta",
  }
  return map[date.getUTCDay()] ?? "education"
}

/** Instagram static posts go out Mon/Wed/Fri; everything else daily. */
export function isScheduledPostDay(platform: SocialPlatformKey, date = new Date()): boolean {
  if (platform === "instagram_static") return [1, 3, 5].includes(date.getUTCDay())
  return true
}
