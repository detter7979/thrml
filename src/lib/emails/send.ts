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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

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

export function thrmlEmailWrapper(content: string): string {
  return `
    <div style="background-color:#1a1a1a;padding:48px 24px;font-family:Georgia,serif;">
      <div style="max-width:520px;margin:0 auto;">
        <div style="margin-bottom:32px;">
          <span style="color:#ffffff;font-size:22px;font-weight:600;letter-spacing:0.15em;">THRML</span>
        </div>
        ${content}
        <hr style="border:none;border-top:1px solid #2e2e2e;margin:32px 0;" />
        <p style="color:#555555;font-size:12px;margin:0;">
          &copy; Thrml ·
          <a href="${APP_URL}" style="color:#555555;text-decoration:none;">
            usethrml.com
          </a>
          · <a href="${APP_URL}/support" style="color:#555555;text-decoration:none;">
            Support
          </a>
        </p>
      </div>
    </div>
  `
}

export function ctaButton(text: string, url: string): string {
  return `
    <a href="${url}"
       style="display:inline-block;background-color:#C4623A;color:#ffffff;
              font-size:16px;font-weight:600;padding:14px 28px;
              border-radius:100px;text-decoration:none;margin-top:8px;">
      ${text}
    </a>
  `
}

export function bookingSummaryCard(fields: { label: string; value: string }[]): string {
  const rows = fields
    .map(
      (field) => `
    <p style="color:#ffffff;font-size:15px;margin:0 0 8px;">
      <span style="color:#a0a0a0;font-size:13px;display:block;margin-bottom:2px;">${field.label}</span>
      ${field.value}
    </p>
  `
    )
    .join("")
  return `
    <div style="background-color:#2a2a2a;border-radius:12px;padding:24px;margin:24px 0;">
      ${rows}
    </div>
  `
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
