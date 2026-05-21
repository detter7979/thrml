import { Resend } from "resend"

import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreferenceKey,
  normalizeNotificationPreferences,
} from "@/lib/notification-preferences"
import { createAdminClient } from "@/lib/supabase/admin"

/** Verified on Resend; used for all transactional sends unless RESEND_FROM_EMAIL overrides. */
export const THRML_TRANSACTIONAL_FROM = "Thrml <notifications@usethrml.com>"

/** Replies go to Zoho (hello@); override with RESEND_REPLY_TO. Pass `replyTo: null` to omit. */
export const THRML_REPLY_TO = "Thrml <hello@usethrml.com>"

export function resolveResendFrom(): string {
  const override = process.env.RESEND_FROM_EMAIL?.trim()
  return override && override.length > 0 ? override : THRML_TRANSACTIONAL_FROM
}

export function resolveResendReplyTo(): string | undefined {
  const override = process.env.RESEND_REPLY_TO?.trim()
  if (override === "__none__") return undefined
  if (override && override.length > 0) return override
  return THRML_REPLY_TO
}

export type SendEmailParams = {
  to: string
  from?: string
  /** Defaults to hello@ (Zoho). Set `null` to skip Reply-To. */
  replyTo?: string | null
  subject: string
  html: string
  text: string
  userId?: string | null
  preferenceKey?: NotificationPreferenceKey
}

export type SendEmailResult = { sent: boolean; error?: string }

export function formatBookingTime(startTime: string, endTime: string): string {
  const start = new Date(startTime)
  const end = new Date(endTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Time TBD"

  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  const startStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
  const endStr = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
  return `${dateStr} · ${startStr} - ${endStr}`
}

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
    const from = params.from ?? resolveResendFrom()
    const replyTo =
      params.replyTo === undefined ? resolveResendReplyTo() : params.replyTo === null ? undefined : params.replyTo

    const { error } = await resend.emails.send({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
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
