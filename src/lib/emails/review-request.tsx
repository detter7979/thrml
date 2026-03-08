import * as React from "react"
import { sendPostSessionReviewRequestEmail } from "@/lib/emails"

type ReviewRequestEmailProps = {
  guestName: string
  listingTitle: string
  serviceType: string
  sessionDate: string
  bookingId: string
  durationLabel: string
  guestCount: number
  appUrl: string
}

function firstName(name: string) {
  const normalized = name.trim()
  if (!normalized) return "there"
  return normalized.split(" ")[0] ?? "there"
}

function titleCaseService(serviceType: string) {
  return serviceType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatSessionDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return "Recent session"
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date)
}

export function ReviewRequestEmail({
  guestName,
  listingTitle,
  serviceType,
  sessionDate,
  bookingId,
  durationLabel,
  guestCount,
  appUrl,
}: ReviewRequestEmailProps) {
  const reviewUrl = `${appUrl}/review/${bookingId}`
  const unsubscribeUrl = `${appUrl}/unsubscribe`

  return (
    <div style={{ margin: 0, padding: "24px 0", backgroundColor: "#F4F0EA" }}>
      <div
        style={{
          maxWidth: "560px",
          margin: "0 auto",
          backgroundColor: "#FFFFFF",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 6px 24px rgba(26,20,16,0.08)",
          fontFamily: "Arial, sans-serif",
          color: "#1A1410",
        }}
      >
        <div style={{ backgroundColor: "#1A1410", padding: "24px" }}>
          <p style={{ margin: 0, color: "#FFFFFF", fontSize: "22px", fontWeight: 700 }}>Thrml</p>
        </div>

        <div style={{ padding: "24px" }}>
          <p style={{ marginTop: 0, marginBottom: "14px", fontSize: "16px" }}>Hi {firstName(guestName)},</p>
          <p style={{ marginTop: 0, marginBottom: "20px", fontSize: "15px", lineHeight: 1.6, color: "#3D3128" }}>
            Hope you&apos;re feeling great after your {titleCaseService(serviceType).toLowerCase()} session at{" "}
            {listingTitle} yesterday.
          </p>

          <div
            style={{
              textAlign: "center",
              backgroundColor: "#C75B3A",
              borderRadius: "12px",
              padding: "20px 18px",
              color: "#FFFFFF",
              marginBottom: "20px",
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700 }}>⭐ Leave a review</p>
            <p style={{ margin: "0 0 14px", fontSize: "13px", opacity: 0.95 }}>Takes less than 2 minutes</p>
            <a
              href={reviewUrl}
              style={{
                display: "inline-block",
                backgroundColor: "#FFFFFF",
                color: "#9A3F25",
                textDecoration: "none",
                fontWeight: 700,
                borderRadius: "10px",
                padding: "10px 16px",
                fontSize: "14px",
              }}
            >
              Share your experience →
            </a>
          </div>

          <div style={{ backgroundColor: "#F6F4F1", borderRadius: "12px", padding: "14px 16px", marginBottom: "18px" }}>
            <p style={{ margin: "0 0 8px", fontSize: "14px" }}>📍 {listingTitle}</p>
            <p style={{ margin: "0 0 8px", fontSize: "14px" }}>📅 {formatSessionDate(sessionDate)}</p>
            <p style={{ margin: 0, fontSize: "14px" }}>
              ⏱ {durationLabel} · {guestCount} {guestCount === 1 ? "guest" : "guests"}
            </p>
          </div>

          <p style={{ marginTop: 0, marginBottom: "22px", fontSize: "14px", color: "#4E4137" }}>
            Your review helps other wellness seekers find great spaces in Seattle.
          </p>

          <p style={{ marginTop: 0, marginBottom: "10px", fontSize: "12px", color: "#796A5E" }}>
            This link expires in 14 days.
          </p>
          <p style={{ marginTop: 0, marginBottom: "6px", fontSize: "12px", color: "#796A5E" }}>
            <a href={unsubscribeUrl} style={{ color: "#796A5E", textDecoration: "underline" }}>
              Unsubscribe
            </a>
          </p>
          <p style={{ margin: 0, fontSize: "12px", color: "#796A5E" }}>Thrml · Seattle, WA</p>
        </div>
      </div>
    </div>
  )
}

type SendReviewRequestArgs = {
  to: string
  guestName: string
  listingTitle: string
  serviceType: string
  sessionDate: string
  bookingId: string
  durationLabel: string
  guestCount: number
}

export async function sendReviewRequestEmail(args: SendReviewRequestArgs) {
  await sendPostSessionReviewRequestEmail({
    guestId: null,
    guestEmail: args.to,
    guestFirstName: args.guestName,
    listingTitle: args.listingTitle,
    bookingId: args.bookingId,
  })
}
