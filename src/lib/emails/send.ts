import { Resend } from "resend"

import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreferenceKey,
  normalizeNotificationPreferences,
} from "@/lib/notification-preferences"
import { createAdminClient } from "@/lib/supabase/admin"

const FROM_EMAIL = "Thrml <notifications@usethermal.com>"

export type SendEmailParams = {
  to: string
  from?: string
  subject: string
  html: string
  text: string
  userId?: string | null
  preferenceKey?: NotificationPreferenceKey
}

export type SendEmailResult = { sent: boolean; error?: string }

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    if (!params.to) return { sent: false, error: "Missing recipient email" }

    if (params.preferenceKey && params.userId) {
      const admin = createAdminClient()
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("notification_preferences")
        .eq("id", params.userId)
        .maybeSingle()

      if (profileError) {
        console.error("[emails/send] preference lookup failed", {
          userId: params.userId,
          error: profileError.message,
        })
      }

      const preferences = normalizeNotificationPreferences(profile?.notification_preferences)
      if (!preferences[params.preferenceKey]) {
        return { sent: false, error: `Preference disabled: ${params.preferenceKey}` }
      }
    } else if (params.preferenceKey) {
      const fallback = NOTIFICATION_PREFERENCE_DEFAULTS[params.preferenceKey]
      if (!fallback) {
        return { sent: false, error: `Preference disabled by default: ${params.preferenceKey}` }
      }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error("[emails/send] RESEND_API_KEY missing")
      return { sent: false, error: "Missing RESEND_API_KEY" }
    }

    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: params.from ?? FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    })

    if (error) {
      const message = typeof error.message === "string" ? error.message : "Unknown Resend error"
      console.error("[emails/send] resend failed", {
        to: params.to,
        subject: params.subject,
        error: message,
      })
      return { sent: false, error: message }
    }

    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email send error"
    console.error("[emails/send] unexpected send error", {
      to: params.to,
      subject: params.subject,
      error: message,
    })
    return { sent: false, error: message }
  }
}
