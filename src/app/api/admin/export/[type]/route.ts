import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import { requireAdminApi } from "@/lib/admin-guard"
import { toCsv, type CsvValue } from "@/lib/csv"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const EXPORT_TYPES = ["bookings", "users", "ledger", "payouts"] as const
type ExportType = (typeof EXPORT_TYPES)[number]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PAGE = 1000

function money(value: unknown): CsvValue {
  if (value === null || value === undefined || value === "") return ""
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(2) : ""
}

function cents(value: unknown): CsvValue {
  const n = Number(value)
  return Number.isFinite(n) ? (n / 100).toFixed(2) : ""
}

/** Reads every row of a query, 1,000 at a time (PostgREST caps a single response). */
async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

/** id → { email, last_sign_in_at } for every auth user. */
async function loadAuthUsers(admin: SupabaseClient) {
  const map = new Map<string, { email: string | null; lastSignIn: string | null }>()
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    for (const u of data.users) map.set(u.id, { email: u.email ?? null, lastSignIn: u.last_sign_in_at ?? null })
    if (data.users.length < 1000) break
  }
  return map
}

async function loadNames(admin: SupabaseClient, ids: string[]) {
  const map = new Map<string, string>()
  const unique = Array.from(new Set(ids.filter(Boolean)))
  for (let i = 0; i < unique.length; i += 500) {
    const { data } = await admin.from("profiles").select("id, full_name").in("id", unique.slice(i, i + 500))
    for (const p of data ?? []) map.set(p.id as string, (p.full_name as string | null) ?? "")
  }
  return map
}

async function loadListingTitles(admin: SupabaseClient, ids: string[]) {
  const map = new Map<string, string>()
  const unique = Array.from(new Set(ids.filter(Boolean)))
  for (let i = 0; i < unique.length; i += 500) {
    const { data } = await admin.from("listings").select("id, title").in("id", unique.slice(i, i + 500))
    for (const l of data ?? []) map.set(l.id as string, (l.title as string | null) ?? "")
  }
  return map
}

type BookingRow = Record<string, unknown> & { id: string; listing_id: string; guest_id: string; host_id: string }

async function exportBookings(admin: SupabaseClient, from: string | null, to: string | null, paidOnly: boolean) {
  const bookings = await readAll<BookingRow>((a, b) => {
    let q = admin
      .from("bookings")
      .select(
        "id, created_at, session_date, start_time, end_time, status, listing_id, guest_id, host_id, guest_count, subtotal, guest_fee, host_fee, service_fee, total_charged, host_payout, refunded_amount, refunded_at, user_credit_applied_cents, referral_credit_applied_cents, referral_code, stripe_payment_intent_id, stripe_transfer_id, stripe_refund_id, cancelled_by, cancelled_at, cancellation_reason"
      )
      .order("session_date", { ascending: true })
      .range(a, b)
    if (from) q = q.gte("session_date", from)
    if (to) q = q.lte("session_date", to)
    if (paidOnly) q = q.in("status", ["confirmed", "completed"])
    return q as unknown as PromiseLike<{ data: BookingRow[] | null; error: { message: string } | null }>
  })

  const [names, titles, auth] = await Promise.all([
    loadNames(admin, bookings.flatMap((b) => [b.guest_id, b.host_id])),
    loadListingTitles(admin, bookings.map((b) => b.listing_id)),
    loadAuthUsers(admin),
  ])
  return { bookings, names, titles, auth }
}

async function buildCsv(admin: SupabaseClient, type: ExportType, from: string | null, to: string | null) {
  if (type === "bookings") {
    const { bookings, names, titles, auth } = await exportBookings(admin, from, to, false)
    return toCsv(
      [
        "Booking ID", "Created", "Session date", "Start", "End", "Status", "Listing",
        "Guest", "Guest email", "Host", "Host email", "Guests",
        "Subtotal", "Guest fee", "Host fee", "Service fee", "Total charged", "Host payout",
        "Refunded", "Refunded at", "User credit applied", "Referral credit applied", "Referral code",
        "Stripe payment intent", "Stripe transfer", "Stripe refund",
        "Cancelled by", "Cancelled at", "Cancellation reason",
      ],
      bookings.map((b) => [
        b.id, b.created_at as string, b.session_date as string, b.start_time as string, b.end_time as string,
        b.status as string, titles.get(b.listing_id) ?? "",
        names.get(b.guest_id) ?? "", auth.get(b.guest_id)?.email ?? "",
        names.get(b.host_id) ?? "", auth.get(b.host_id)?.email ?? "", b.guest_count as number,
        money(b.subtotal), money(b.guest_fee), money(b.host_fee), money(b.service_fee),
        money(b.total_charged), money(b.host_payout), money(b.refunded_amount), b.refunded_at as string,
        cents(b.user_credit_applied_cents ?? 0), cents(b.referral_credit_applied_cents ?? 0), b.referral_code as string,
        b.stripe_payment_intent_id as string, b.stripe_transfer_id as string, b.stripe_refund_id as string,
        b.cancelled_by as string, b.cancelled_at as string, b.cancellation_reason as string,
      ])
    )
  }

  if (type === "payouts") {
    const { bookings, names, titles, auth } = await exportBookings(admin, from, to, true)
    return toCsv(
      ["Session date", "Booking ID", "Status", "Listing", "Host", "Host email", "Total charged", "Host payout", "Refunded", "Stripe transfer", "Transfer recorded"],
      bookings.map((b) => [
        b.session_date as string, b.id, b.status as string, titles.get(b.listing_id) ?? "",
        names.get(b.host_id) ?? "", auth.get(b.host_id)?.email ?? "",
        money(b.total_charged), money(b.host_payout), money(b.refunded_amount),
        b.stripe_transfer_id as string, b.stripe_transfer_id ? "yes" : "no",
      ])
    )
  }

  if (type === "ledger") {
    type EventRow = Record<string, unknown>
    const events = await readAll<EventRow>((a, b) => {
      let q = admin
        .from("financial_events")
        .select("occurred_at, event_type, amount_cents, currency, booking_id, user_id, source, stripe_object_id, stripe_event_id, metadata")
        .order("occurred_at", { ascending: true })
        .range(a, b)
      if (from) q = q.gte("occurred_at", `${from}T00:00:00Z`)
      if (to) q = q.lte("occurred_at", `${to}T23:59:59.999Z`)
      return q as unknown as PromiseLike<{ data: EventRow[] | null; error: { message: string } | null }>
    })
    return toCsv(
      ["Occurred at", "Event", "Amount", "Currency", "Booking ID", "User ID", "Source", "Stripe object", "Stripe event", "Details"],
      events.map((e) => [
        e.occurred_at as string, e.event_type as string, cents(e.amount_cents), (e.currency as string) ?? "usd",
        e.booking_id as string, e.user_id as string, e.source as string,
        e.stripe_object_id as string, e.stripe_event_id as string,
        e.metadata ? JSON.stringify(e.metadata) : "",
      ])
    )
  }

  // users
  type ProfileRow = Record<string, unknown> & { id: string }
  const profiles = await readAll<ProfileRow>((a, b) => {
    let q = admin
      .from("profiles")
      .select("id, full_name, phone, created_at, is_host, is_admin, is_banned, is_deleted, id_verified, stripe_payouts_enabled, newsletter_opted_in, marketing_consent, host_since")
      .order("created_at", { ascending: true })
      .range(a, b)
    if (from) q = q.gte("created_at", `${from}T00:00:00Z`)
    if (to) q = q.lte("created_at", `${to}T23:59:59.999Z`)
    return q as unknown as PromiseLike<{ data: ProfileRow[] | null; error: { message: string } | null }>
  })
  const auth = await loadAuthUsers(admin)
  const [{ data: listingRows }, { data: bookingRows }] = await Promise.all([
    admin.from("listings").select("host_id").eq("is_deleted", false),
    admin.from("bookings").select("guest_id").in("status", ["confirmed", "completed"]),
  ])
  const listingsByHost = new Map<string, number>()
  for (const l of listingRows ?? []) listingsByHost.set(l.host_id as string, (listingsByHost.get(l.host_id as string) ?? 0) + 1)
  const bookingsByGuest = new Map<string, number>()
  for (const b of bookingRows ?? []) bookingsByGuest.set(b.guest_id as string, (bookingsByGuest.get(b.guest_id as string) ?? 0) + 1)

  const yesNo = (v: unknown) => (v === true ? "yes" : "no")
  return toCsv(
    ["User ID", "Name", "Email", "Phone", "Joined", "Last sign-in", "Host", "Host since", "Listings", "Paid bookings as guest", "Admin", "Banned", "Deleted", "ID verified", "Payouts enabled", "Newsletter", "Marketing consent"],
    profiles.map((p) => [
      p.id, p.full_name as string, auth.get(p.id)?.email ?? "", p.phone as string, p.created_at as string,
      auth.get(p.id)?.lastSignIn ?? "", yesNo(p.is_host), p.host_since as string,
      listingsByHost.get(p.id) ?? 0, bookingsByGuest.get(p.id) ?? 0,
      yesNo(p.is_admin), yesNo(p.is_banned), yesNo(p.is_deleted), yesNo(p.id_verified),
      yesNo(p.stripe_payouts_enabled), yesNo(p.newsletter_opted_in),
      p.marketing_consent === null || p.marketing_consent === undefined ? "" : yesNo(p.marketing_consent),
    ])
  )
}

/**
 * GET /api/admin/export/{bookings|users|ledger|payouts}?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Admin-only CSV download. Dates filter session date (bookings, payouts), event date
 * (ledger) or sign-up date (users); both are optional.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { error, admin } = await requireAdminApi()
  if (error || !admin) return error

  const { type } = await params
  if (!EXPORT_TYPES.includes(type as ExportType)) {
    return NextResponse.json({ error: `type must be one of: ${EXPORT_TYPES.join(", ")}` }, { status: 400 })
  }
  const from = req.nextUrl.searchParams.get("from")
  const to = req.nextUrl.searchParams.get("to")
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 })
  }

  try {
    const csv = await buildCsv(admin, type as ExportType, from, to)
    const label = [from, to].filter(Boolean).join("_to_") || new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="thrml-${type}-${label}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
