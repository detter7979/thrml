import type { SupabaseClient } from "@supabase/supabase-js"

import {
  availabilityWindowsForDay,
  durationBetweenTimes,
  fromMinutes,
  parseIsoDate,
  toMinutes,
} from "@/lib/bookings/listing-availability"
import { roundUpTo30 } from "@/lib/slots"

export type RescheduleSlotOption = {
  startTime: string
  endTime: string
  label: string
}

type BookedInterval = { start_time: string; end_time: string }

const PENDING_PAYMENT_STALE_MS = 15 * 60 * 1000

function formatSlotLabel(startTime: string, endTime: string) {
  const start = new Date(`1970-01-01T${startTime}`)
  const end = new Date(`1970-01-01T${endTime}`)
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase()
  return `${fmt(start)} – ${fmt(end)}`
}

function normalizeBookedRows(
  rows: Array<{ start_time: string; end_time: string; status?: string | null; created_at?: string | null }>
): BookedInterval[] {
  const staleCutoffMs = Date.now() - PENDING_PAYMENT_STALE_MS
  return rows
    .filter((row) => typeof row.start_time === "string" && typeof row.end_time === "string")
    .filter((row) => {
      const status = typeof row.status === "string" ? row.status : "confirmed"
      if (status === "confirmed") return true
      if (status !== "pending_payment") return false
      if (typeof row.created_at !== "string") return true
      const createdMs = new Date(row.created_at).getTime()
      return Number.isFinite(createdMs) && createdMs >= staleCutoffMs
    })
}

export async function loadListingAvailability(admin: SupabaseClient, listingId: string) {
  const [{ data: listing }, { data: availabilityRows }] = await Promise.all([
    admin.from("listings").select("availability, min_duration_override_minutes, fixed_session_minutes, session_type").eq("id", listingId).maybeSingle(),
    admin.from("availability").select("day_of_week, start_time, end_time, is_available").eq("listing_id", listingId),
  ])

  const listingAvailability = Array.isArray(listing?.availability) ? (listing.availability as unknown[]) : []
  const fallbackAvailability = (availabilityRows ?? []).map((row) => ({
    day: row.day_of_week,
    start: row.start_time,
    end: row.end_time,
    enabled: row.is_available !== false,
  }))
  const availability = listingAvailability.length ? listingAvailability : fallbackAvailability

  const isFixed = listing?.session_type === "fixed_session"
  const fixedMins = Number(listing?.fixed_session_minutes ?? 0)
  const minOverride = Number(listing?.min_duration_override_minutes ?? 0)
  const durationMinutes = isFixed && fixedMins > 0 ? fixedMins : minOverride > 0 ? minOverride : 60
  const slotIncrement = roundUpTo30(durationMinutes)

  return { availability, durationMinutes, slotIncrement, minMins: durationMinutes }
}

export async function loadBookedIntervalsForDate(
  admin: SupabaseClient,
  listingId: string,
  sessionDate: string,
  excludeBookingId: string
): Promise<BookedInterval[]> {
  const { data: slotRows, error: slotError } = await admin
    .from("booked_slots")
    .select("start_time, end_time, status, created_at, booking_id")
    .eq("listing_id", listingId)
    .eq("session_date", sessionDate)

  if (!slotError && Array.isArray(slotRows)) {
    return normalizeBookedRows(
      slotRows.filter((row) => {
        const bid = typeof row.booking_id === "string" ? row.booking_id : null
        return !bid || bid !== excludeBookingId
      }) as Array<{ start_time: string; end_time: string; status?: string | null; created_at?: string | null }>
    )
  }

  const { data: bookingRows } = await admin
    .from("bookings")
    .select("start_time, end_time")
    .eq("listing_id", listingId)
    .eq("session_date", sessionDate)
    .neq("id", excludeBookingId)
    .in("status", ["pending_host", "pending", "confirmed", "completed"])

  return (bookingRows ?? []).filter(
    (row): row is BookedInterval =>
      typeof row.start_time === "string" && typeof row.end_time === "string"
  )
}

export function buildRescheduleSlotOptions(params: {
  availability: unknown[]
  sessionDate: string
  durationMinutes: number
  slotIncrement: number
  minMins: number
  booked: BookedInterval[]
  minLeadMinutes?: number
}): RescheduleSlotOption[] {
  const normalizedDate = parseIsoDate(params.sessionDate)
  if (!normalizedDate) return []

  const date = new Date(`${normalizedDate}T12:00:00`)
  const windows = availabilityWindowsForDay(params.availability, date)
  if (!windows.length) return []

  const now = new Date()
  const isSameDay = normalizedDate === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const minLead = params.minLeadMinutes ?? 120

  const overlapsBooked = (slotStart: number, slotEnd: number) =>
    params.booked.some((booked) => {
      const bookedStart = toMinutes(booked.start_time) ?? 0
      const bookedEnd = toMinutes(booked.end_time) ?? 0
      return bookedStart < slotEnd && bookedEnd > slotStart
    })

  const slots: RescheduleSlotOption[] = []

  for (const window of windows) {
    for (
      let slotStart = window.startMinutes;
      slotStart < window.endMinutes;
      slotStart += params.slotIncrement
    ) {
      const slotEnd = slotStart + params.durationMinutes
      if (slotEnd > window.endMinutes) continue
      if (window.endMinutes - slotStart < params.minMins) continue

      if (isSameDay && slotStart <= nowMins) continue

      const newSessionStart = new Date(`${normalizedDate}T${fromMinutes(slotStart)}`)
      if (newSessionStart.getTime() < now.getTime() + minLead * 60 * 1000) continue

      if (overlapsBooked(slotStart, slotEnd)) continue

      const startTime = fromMinutes(slotStart)
      const endTime = fromMinutes(slotEnd)
      slots.push({
        startTime,
        endTime,
        label: formatSlotLabel(startTime, endTime),
      })
    }
  }

  return slots
}

export function validateRescheduleTimes(params: {
  sessionDate: string
  startTime: string
  endTime: string
  expectedDurationMinutes: number
}): { ok: true } | { ok: false; error: string } {
  if (!parseIsoDate(params.sessionDate)) {
    return { ok: false, error: "Invalid session date" }
  }
  const duration = durationBetweenTimes(params.startTime, params.endTime)
  if (duration === null) {
    return { ok: false, error: "End time must be after start time" }
  }
  if (Math.abs(duration - params.expectedDurationMinutes) > 1) {
    return {
      ok: false,
      error: `Session must stay ${params.expectedDurationMinutes} minutes long for this booking`,
    }
  }
  return { ok: true }
}
