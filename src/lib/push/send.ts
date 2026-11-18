import "server-only"

import { isDeadToken, sendApns, apnsConfigured, type ApnsMessage } from "@/lib/push/apns"
import {
  normalizeNotificationPreferences,
  type NotificationPreferenceKey,
} from "@/lib/notification-preferences"
import { createAdminClient } from "@/lib/supabase/admin"

const APP_ORIGIN = "https://usethrml.com"

export type PushMessage = ApnsMessage & {
  /** The preference that gates this notification, same keys as email. */
  preferenceKey?: NotificationPreferenceKey
}

/** Turns an absolute usethrml.com URL into an in-app path; leaves paths alone. */
export function toAppPath(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith("/")) return url
  try {
    const parsed = new URL(url)
    if (parsed.hostname.endsWith("usethrml.com") || parsed.origin === APP_ORIGIN) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    // not a URL
  }
  return undefined
}

/**
 * Sends a phone notification to every active device the user has registered in the iOS app.
 * Quietly does nothing when APNs isn't configured, the user has no devices, or they turned the
 * notification (or push as a whole) off. Never throws: a failed push must not fail the action.
 */
export async function sendPushToUser(userId: string | null | undefined, message: PushMessage) {
  if (!userId || !apnsConfigured()) return { sent: 0 }
  try {
    const admin = createAdminClient()
    const [{ data: profile }, { data: devices }] = await Promise.all([
      admin.from("profiles").select("notification_preferences").eq("id", userId).maybeSingle(),
      admin.from("push_devices").select("id, token").eq("user_id", userId).is("disabled_at", null),
    ])
    if (!devices?.length) return { sent: 0 }

    const prefs = normalizeNotificationPreferences(profile?.notification_preferences)
    if (!prefs.push_enabled) return { sent: 0 }
    if (message.preferenceKey && !prefs[message.preferenceKey]) return { sent: 0 }

    const results = await sendApns(
      devices.map((device) => device.token),
      { title: message.title, body: message.body, url: toAppPath(message.url), threadId: message.threadId }
    )

    const dead = results.filter(isDeadToken).map((result) => result.token)
    if (dead.length) {
      await admin.from("push_devices").update({ disabled_at: new Date().toISOString() }).in("token", dead)
    }
    const failed = results.filter((result) => !result.ok && !isDeadToken(result))
    if (failed.length) {
      console.error("[push] APNs errors", failed.map((result) => ({ status: result.status, reason: result.reason })))
    }
    return { sent: results.filter((result) => result.ok).length }
  } catch (error) {
    console.error("[push] send failed", error instanceof Error ? error.message : error)
    return { sent: 0 }
  }
}
