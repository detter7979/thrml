export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  new_booking: true,
  booking_cancelled: true,
  new_review: true,
  payout_sent: true,
  credit_grants: true,
  marketing_wellness_tips: false,
  marketing_offers: false,
  marketing_product_updates: false,
} as const

export type NotificationPreferenceKey = keyof typeof NOTIFICATION_PREFERENCE_DEFAULTS
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    new_booking:
      typeof source.new_booking === "boolean"
        ? source.new_booking
        : NOTIFICATION_PREFERENCE_DEFAULTS.new_booking,
    booking_cancelled:
      typeof source.booking_cancelled === "boolean"
        ? source.booking_cancelled
        : NOTIFICATION_PREFERENCE_DEFAULTS.booking_cancelled,
    new_review:
      typeof source.new_review === "boolean"
        ? source.new_review
        : NOTIFICATION_PREFERENCE_DEFAULTS.new_review,
    payout_sent:
      typeof source.payout_sent === "boolean"
        ? source.payout_sent
        : NOTIFICATION_PREFERENCE_DEFAULTS.payout_sent,
    credit_grants:
      typeof source.credit_grants === "boolean"
        ? source.credit_grants
        : NOTIFICATION_PREFERENCE_DEFAULTS.credit_grants,
    marketing_wellness_tips:
      typeof source.marketing_wellness_tips === "boolean"
        ? source.marketing_wellness_tips
        : NOTIFICATION_PREFERENCE_DEFAULTS.marketing_wellness_tips,
    marketing_offers:
      typeof source.marketing_offers === "boolean"
        ? source.marketing_offers
        : NOTIFICATION_PREFERENCE_DEFAULTS.marketing_offers,
    marketing_product_updates:
      typeof source.marketing_product_updates === "boolean"
        ? source.marketing_product_updates
        : NOTIFICATION_PREFERENCE_DEFAULTS.marketing_product_updates,
  }
}
