export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  new_booking: true,
  booking_cancelled: true,
  new_review: true,
  payout_sent: true,
  credit_grants: true,
  /** A new message in a guest–host conversation. */
  new_message: true,
  /** Master switch for phone notifications from the iOS app (emails are unaffected). */
  push_enabled: true,
  marketing_wellness_tips: false,
  marketing_offers: false,
  marketing_product_updates: false,
} as const

export type NotificationPreferenceKey = keyof typeof NOTIFICATION_PREFERENCE_DEFAULTS
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const keys = Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS) as NotificationPreferenceKey[]
  return Object.fromEntries(
    keys.map((key) => [key, typeof source[key] === "boolean" ? (source[key] as boolean) : NOTIFICATION_PREFERENCE_DEFAULTS[key]])
  ) as NotificationPreferences
}
