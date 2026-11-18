import { sendThrmlLayoutEmail, THRML_APP_URL } from "@/lib/emails/transactional-send"
import {
  AVAILABILITY_LABEL,
  OWNS_SAUNA_LABEL,
  PRIVATE_ACCESS_LABEL,
  type HostApplicationInput,
} from "@/lib/host/host-applications"

const APP_URL = THRML_APP_URL

/** Where internal alerts go. Override with ADMIN_ALERT_EMAIL. */
export function adminAlertEmail(): string {
  return process.env.ADMIN_ALERT_EMAIL?.trim() || "hello@usethrml.com"
}

function firstName(full: string | null | undefined): string {
  const f = (full ?? "").trim().split(/\s+/)[0]
  return f ? f : "there"
}

/** Applicant confirmation: owners hear about review; everyone else gets the earnings estimate. */
export async function sendHostApplicationReceivedEmail(input: HostApplicationInput) {
  if (input.owns_sauna === "yes") {
    return sendThrmlLayoutEmail({
      to: input.email,
      subject: "We got your thrml host application",
      layout: {
        preview: "Thanks for applying to host on thrml",
        kicker: "Founding hosts",
        title: `Thanks, ${firstName(input.full_name)}. We got your application.`,
        paragraphs: [
          "We're starting thrml in Seattle with a small group of hand-picked founding hosts, so we read every application ourselves.",
          "If your sauna looks like a fit for this first group, Dom or Casie will reach out within a few days to set up a quick call. If not, you're on our list for the next group and we'll be in touch.",
          "Questions in the meantime? Just reply to this email.",
        ],
        footnote: "You're receiving this because you applied to host at usethrml.com.",
      },
    })
  }

  return sendThrmlLayoutEmail({
    to: input.email,
    subject: "You're on the thrml future-host list",
    layout: {
      preview: "See what a sauna could earn on thrml",
      kicker: "Future hosts",
      title: "You're on the list.",
      paragraphs: [
        "thrml lets people book a private sauna by the session from someone nearby. We're starting in Seattle with a small group of hosts who already have one.",
        "When you're ready, the earnings estimate on our host page shows what a sauna could bring in at your price and schedule. We'll reach out when we open the next round of hosts.",
      ],
      cta: { label: "See what you could earn", href: `${APP_URL}/become-a-host` },
      footnote: "You're receiving this because you joined the thrml future-host list at usethrml.com.",
    },
  })
}

export async function sendAdminNewApplicationEmail(input: HostApplicationInput) {
  const owner = input.owns_sauna === "yes"
  const lines = [
    `${input.full_name ?? "(no name)"} · ${input.email}`,
    `Owns a sauna: ${OWNS_SAUNA_LABEL[input.owns_sauna]}`,
    `Neighborhood: ${input.neighborhood ?? "—"}`,
  ]
  if (owner) {
    lines.push(
      `Sauna: ${input.sauna_type}`,
      `Guest access: ${PRIVATE_ACCESS_LABEL[input.private_access] ?? input.private_access}`,
      `Availability: ${AVAILABILITY_LABEL[input.availability] ?? input.availability}`,
      input.phone ? `Phone: ${input.phone}` : "Phone: —",
      input.notes ? `Notes: ${input.notes}` : "Notes: —"
    )
  }
  if (input.utm_source || input.utm_campaign) {
    lines.push(`Source: ${[input.utm_source, input.utm_campaign].filter(Boolean).join(" / ")}`)
  }

  return sendThrmlLayoutEmail({
    to: adminAlertEmail(),
    replyTo: input.email,
    subject: owner
      ? `New host application: ${input.full_name ?? input.email} (${input.neighborhood ?? "?"})`
      : `New future-host lead: ${input.email}`,
    layout: {
      preview: owner ? "A sauna owner applied to host" : "Someone joined the future-host list",
      kicker: owner ? "Host application" : "Future-host lead",
      title: owner ? "New founding-host application" : "New future-host lead",
      paragraphs: lines,
      cta: { label: "Review applications", href: `${APP_URL}/admin/host-applications` },
    },
  })
}

export async function sendAdminListingPendingEmail(args: { listingId: string; title: string | null; hostEmail: string | null }) {
  return sendThrmlLayoutEmail({
    to: adminAlertEmail(),
    subject: `Listing waiting for approval: ${args.title ?? args.listingId}`,
    layout: {
      preview: "A new listing needs your review",
      kicker: "Listing review",
      title: "A listing is waiting for approval",
      paragraphs: [
        `${args.title ?? "Untitled listing"}${args.hostEmail ? ` · host ${args.hostEmail}` : ""}`,
        "It stays hidden from guests until you approve it.",
      ],
      cta: { label: "Review in admin", href: `${APP_URL}/admin/listings?filter=pending` },
    },
  })
}

export async function sendHostListingDecisionEmail(args: {
  to: string
  userId: string | null
  listingId: string
  title: string | null
  approved: boolean
  founding: boolean
  note: string | null
}) {
  const listingUrl = `${APP_URL}/listings/${args.listingId}`
  if (args.approved) {
    return sendThrmlLayoutEmail({
      to: args.to,
      userId: args.userId,
      subject: args.founding ? "You're a thrml founding host 🎉" : "Your thrml listing is live",
      layout: {
        preview: "Your listing was approved",
        kicker: args.founding ? "Founding host" : "Listing approved",
        title: `${args.title ?? "Your listing"} is live`,
        paragraphs: [
          args.founding
            ? "Welcome to the founding group. Your reduced founding host fee starts with your first paid booking."
            : "Your listing passed review and guests can now find and book it.",
          ...(args.note ? [args.note] : []),
          "Make sure payouts and ID verification are finished in your dashboard so bookings can go through.",
        ],
        cta: { label: "View your listing", href: listingUrl },
      },
    })
  }
  return sendThrmlLayoutEmail({
    to: args.to,
    userId: args.userId,
    subject: "About your thrml listing",
    layout: {
      preview: "An update on your listing review",
      kicker: "Listing review",
      title: "We can't approve this listing yet",
      paragraphs: [
        "Thanks for listing with thrml. We're starting with a small group of hosts, and this listing isn't a fit for the first round.",
        ...(args.note ? [args.note] : []),
        "You're on our list for the next group. Reply to this email if you have questions.",
      ],
    },
  })
}
