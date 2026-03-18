"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Apple,
  Armchair,
  ChevronLeft,
  ArrowDownToLine,
  Bed,
  BookOpen,
  CalendarDays,
  Car,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Coffee,
  DoorOpen,
  Droplets,
  EarOff,
  Eye,
  Flower2,
  Flame,
  Glasses,
  KeyRound,
  Leaf,
  Lightbulb,
  Lock,
  Music,
  Settings,
  Shield,
  Shirt,
  Sparkles,
  Sun,
  Thermometer,
  Timer,
  TreePine,
  VolumeX,
  Waves,
  Wifi,
  Wind,
  Umbrella,
  UserCheck,
  Zap,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DurationSelector } from "@/components/booking/DurationSelector"
import { RatingSummary } from "@/components/reviews/RatingSummary"
import { ReviewCard } from "@/components/reviews/ReviewCard"
import { SaveButton } from "@/components/listings/SaveButton"
import { ShareButton } from "@/components/listings/ShareButton"
import { TimeSlotPicker } from "@/components/booking/TimeSlotPicker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { calculateBookingTotal, getPricePerPerson, type PricingTiers } from "@/lib/pricing"
import { AMENITIES_BY_SERVICE_TYPE } from "@/lib/constants/amenities"
import { getCancellationPolicy } from "@/lib/constants/cancellation-policies"
import { SPEC_CONFIG } from "@/lib/constants/specs"
import { trackMetaEvent } from "@/components/meta-pixel"
import { trackGaEvent } from "@/lib/analytics/ga"
import { roundUpTo30 } from "@/lib/slots"
import { createClient } from "@/lib/supabase/client"
import type { BookingModel } from "@/lib/service-types"
import { useScrollReveal } from "@/hooks/useScrollReveal"

interface HostProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  is_superhost: boolean | null
  created_at: string | null
  response_rate?: number | null
  response_time?: string | null
  response_time_hours?: number | null
  bio?: string | null
  average_rating?: number | null
  total_reviews?: number | null
}

interface Photo {
  url: string
  order_index?: number | null
}

interface Review {
  id: string
  rating_overall: number
  rating_cleanliness: number | null
  rating_accuracy: number | null
  rating_communication: number | null
  rating_value: number | null
  photo_urls?: string[]
  host_response?: string | null
  host_responded_at?: string | null
  comment: string | null
  created_at: string | null
  profile: {
    full_name: string | null
    avatar_url: string | null
  } | null
  recommended?: boolean | null
}

interface ListingDetailProps {
  id: string
  title: string
  locationLabel: string
  city: string | null
  state: string | null
  serviceTypeId: string
  serviceTypeName: string
  serviceTypeIcon: string
  bookingModel: BookingModel
  healthDisclaimer: string | null
  saunaType: string | null
  capacity: number | null
  description: string | null
  serviceAttributes: Record<string, unknown>
  serviceDurationMin: number | null
  serviceDurationMax: number | null
  serviceDurationUnit: "minutes" | "hours"
  amenities: string[]
  houseRules: string[]
  host: HostProfile | null
  photos: Photo[]
  reviews: Review[]
  ratings: {
    avg_overall: number
    review_count: number
  }
  isHostView?: boolean
  pricing: PricingTiers
  availability: unknown[]
  blackoutDates: string[]
  durationConstraints: {
    minMins: number
    maxMins: number
    increment: number
    sessionType: "hourly" | "fixed_session"
  }
  canReserve: boolean
  hostPayoutsReady: boolean
  cancellationPolicy: string | null
  backToResultsPath?: string | null
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function toDisplayMinutes(value: number, unit: "minutes" | "hours") {
  const normalized = Math.max(1, Math.round(value))
  return unit === "hours" ? normalized * 60 : normalized
}

function formatCompactDuration(minutes: number) {
  const safeMinutes = Math.max(1, Math.round(minutes))
  if (safeMinutes < 60) return `${safeMinutes} min`
  const hours = Math.floor(safeMinutes / 60)
  const remainder = safeMinutes % 60
  if (remainder === 0) return `${hours}hr`
  return `${hours}hr ${remainder} min`
}

function formatMinutesLabel(minutes: number) {
  return `${Math.max(1, Math.round(minutes))} min`
}

function formatNaturalDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function formatSlotLabel(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map((part) => Number(part))
  const [endHour, endMinute] = endTime.split(":").map((part) => Number(part))
  const start = new Date()
  const end = new Date()
  start.setHours(Number.isFinite(startHour) ? startHour : 0, Number.isFinite(startMinute) ? startMinute : 0, 0, 0)
  end.setHours(Number.isFinite(endHour) ? endHour : 0, Number.isFinite(endMinute) ? endMinute : 0, 0, 0)

  const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
  const suffixFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true })
  const startText = timeFormatter.format(start).replace(/\s?(AM|PM)$/i, "")
  const endText = timeFormatter.format(end).replace(/\s?(AM|PM)$/i, "")
  const startSuffix = suffixFormatter.format(start).match(/(AM|PM)$/i)?.[1] ?? ""
  const endSuffix = suffixFormatter.format(end).match(/(AM|PM)$/i)?.[1] ?? ""

  if (startSuffix !== endSuffix) {
    return `${startText} ${startSuffix}\u2013${endText} ${endSuffix}`.trim()
  }

  return `${startText}\u2013${endText} ${endSuffix}`.trim()
}

function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const truncated = text.slice(0, maxChars)
  const lastPeriod = truncated.lastIndexOf(".")
  const lastExclaim = truncated.lastIndexOf("!")
  const lastQuestion = truncated.lastIndexOf("?")
  const lastSentence = Math.max(lastPeriod, lastExclaim, lastQuestion)
  if (lastSentence > maxChars * 0.6) {
    return truncated.slice(0, lastSentence + 1)
  }
  return `${truncated}...`
}

function buildServiceDurationLabel(params: {
  min: number | null
  max: number | null
  unit: "minutes" | "hours"
  fallbackBlockMins: number
}) {
  const { min, max, unit, fallbackBlockMins } = params
  if (typeof min === "number" && typeof max === "number") {
    const minMinutes = toDisplayMinutes(min, unit)
    const maxMinutes = toDisplayMinutes(max, unit)
    if (minMinutes === maxMinutes) return `${formatCompactDuration(minMinutes)} sessions`
    return `${formatCompactDuration(minMinutes)}—${formatCompactDuration(maxMinutes)} sessions`
  }
  return `From ${formatCompactDuration(fallbackBlockMins)}`
}

function amenityIcon(amenity: string) {
  const iconMap: Record<string, typeof CalendarDays> = {
    // Towels & Linens
    "Towels provided": Shirt,
    "Robe provided": Shirt,

    // Water & Temperature
    "Cold shower": Droplets,
    "Cold outdoor shower": Droplets,
    "Warm shower post-plunge": Thermometer,
    "Shower (pre & post)": Droplets,
    "Shower access": Droplets,
    "Outdoor shower": Droplets,
    "Cold plunge": Waves,
    "Cold plunge included": Waves,
    "Sauna included": Flame,
    "Infrared sauna included": Zap,

    // Access & Entry
    "Steps/ladder access": ArrowDownToLine,
    "Changing room": DoorOpen,
    "Private room": Lock,
    "Access code provided": KeyRound,

    // Parking & Location
    "Parking": Car,
    "Parking available": Car,
    "Parking on site": Car,
    "Parking street": Car,
    "Parking validation": Car,
    "Street parking": Car,
    "Beach access": Waves,

    // Equipment & Tools
    "Timer provided": Timer,
    "Temperature gauge visible": Thermometer,
    "Protocol guide provided": ClipboardList,
    "Eye protection provided": Glasses,
    "Bluetooth audio": Music,
    "WiFi inside chamber": Wifi,

    // Shelter & Outdoor
    "Covered shelter": Umbrella,
    "Outdoor deck": TreePine,
    "Outdoor setting": TreePine,
    "Outdoor garden": Flower2,
    "Rose garden": Flower2,
    "Fire pit": Flame,
    "String lights": Lightbulb,
    "Evening lighting": Lightbulb,

    // Views
    "Ocean views": Eye,
    "Pacific views": Eye,
    "Canyon views": Eye,
    "Reservoir views": Eye,
    "Observatory views": Eye,
    "Lake views": Eye,

    // Food & Drink
    "Herbal tea": Coffee,
    "Post-float tea": Coffee,
    "Fruit and drinks provided": Apple,

    // Wellness Equipment
    "Birch whisk (vihta)": Leaf,
    "Eucalyptus steam": Wind,
    "Full body mat": Bed,
    "Recliner/bed provided": Bed,
    "Zero gravity chairs": Armchair,
    Halogenerator: Wind,
    "Soft shell chamber": Shield,
    "Attendant on-site": UserCheck,
    "Medical clearance required": ClipboardList,
    "Earplugs provided": EarOff,

    // Sauna specific
    "Wood-fired sauna": Flame,

    // Salt & Spa
    "Dry salt room": Sparkles,
    "Salt cave aesthetic": Sparkles,
    "Epsom salt (standard)": Sparkles,
    "Journaling space": BookOpen,
    "Quiet/no talking": VolumeX,
    "Quiet space": VolumeX,
    "Self-serve": Settings,
    "Light therapy option": Sun,
    Chromotherapy: Sun,
    "Ocean breeze": Wind,
  }

  return iconMap[amenity] ?? CheckCircle
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

function normalizeDayIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Primary format: JS day index (Sun=0 ... Sat=6)
    if (value >= 0 && value <= 6) return value
    // Backward-compatible format: 1..7 where Sunday may be represented as 7
    if (value >= 1 && value <= 7) return value % 7
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    const aliases: Record<string, number> = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tues: 2,
      tuesday: 2,
      wed: 3,
      wednesday: 3,
      thu: 4,
      thur: 4,
      thurs: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6,
    }
    if (normalized in aliases) return aliases[normalized]
    const asNumber = Number(normalized)
    if (Number.isFinite(asNumber)) return normalizeDayIndex(asNumber)
  }
  return null
}

function fromMinutes(total: number) {
  const normalized = Math.max(0, Math.min(total, 24 * 60 - 1))
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function initialsFromFullName(name: string) {
  const parts = name.split(" ").filter(Boolean)
  if (!parts.length) return "TH"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase()
}

function availabilityWindowsForDay(availability: unknown[], date: Date) {
  const jsDay = date.getDay()
  const rawRows = availability.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"
  )

  return rawRows
    .filter((item) => {
      const dayIndex =
        normalizeDayIndex(item.day) ??
        normalizeDayIndex(item.day_of_week) ??
        normalizeDayIndex(item.dayIndex)
      const dayMatches = dayIndex === jsDay
      const enabled =
        typeof item.enabled === "boolean"
          ? item.enabled
          : typeof item.is_available === "boolean"
            ? item.is_available
            : typeof item.isAvailable === "boolean"
              ? item.isAvailable
              : true
      return dayMatches && enabled
    })
    .map((window) => {
      const startMinutes = toMinutes(
        typeof window.start === "string"
          ? window.start
          : typeof window.start_time === "string"
            ? window.start_time
            : "10:00"
      )
      const endMinutes = toMinutes(
        typeof window.end === "string"
          ? window.end
          : typeof window.end_time === "string"
            ? window.end_time
            : "18:00"
      )
      return { startMinutes, endMinutes }
    })
    .filter((window) => window.endMinutes > window.startMinutes)
}

function BookingWidget({
  pricing,
  listingId,
  listingTitle,
  city,
  state,
  bookingModel,
  serviceTypeName,
  serviceDurationMin,
  serviceDurationMax,
  serviceDurationUnit,
  availability,
  blackoutDates,
  serviceTypeId,
  durationConstraints,
  capacity,
  canReserve,
  hostPayoutsReady,
  cancellationPolicy,
}: {
  pricing: PricingTiers
  listingId: string
  listingTitle: string
  city: string | null
  state: string | null
  bookingModel: BookingModel
  serviceTypeName: string
  serviceDurationMin: number | null
  serviceDurationMax: number | null
  serviceDurationUnit: "minutes" | "hours"
  availability: unknown[]
  blackoutDates: string[]
  serviceTypeId: string
  durationConstraints: {
    minMins: number
    maxMins: number
    increment: number
    sessionType: "hourly" | "fixed_session"
  }
  capacity: number | null
  canReserve: boolean
  hostPayoutsReady: boolean
  cancellationPolicy: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [guestCount, setGuestCount] = useState(1)
  const [durationMinutes, setDurationMinutes] = useState(Math.max(30, durationConstraints.minMins))
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null)
  const [bookedSlots, setBookedSlots] = useState<Array<{ start_time: string; end_time: string }>>([])
  const [slotNotice, setSlotNotice] = useState<string | null>(null)
  const [notifyMessage, setNotifyMessage] = useState<string | null>(null)
  const [isNotifyLoading, setIsNotifyLoading] = useState(false)

  const durationHours = durationMinutes / 60
  const chargeDurationHours = bookingModel === "fixed_session" ? 1 : durationHours
  const rawIncrement = durationConstraints.minMins
  const minDuration = Math.max(30, roundUpTo30(rawIncrement))
  const durationStep = 30
  const slotIncrement = Math.max(30, roundUpTo30(rawIncrement))
  const minMins = minDuration
  const maxMins = Math.max(minMins, durationConstraints.maxMins)
  const increment = durationStep
  const serviceDurationLabel = buildServiceDurationLabel({
    min: serviceDurationMin,
    max: serviceDurationMax,
    unit: serviceDurationUnit,
    fallbackBlockMins: minMins,
  })
  const slotHelperText =
    bookingModel === "fixed_session"
      ? `Sessions are ${formatMinutesLabel(minMins)}.`
      : `Each time slot is ${formatCompactDuration(minMins)}. Typical ${serviceTypeName.toLowerCase()} sessions are ${serviceDurationLabel.toLowerCase()}.`
  const fixedSessionLabel = `${formatMinutesLabel(minMins)} sessions`
  const maxGuests = Math.max(1, capacity ?? 1)
  const blackoutDateSet = useMemo(() => new Set(blackoutDates), [blackoutDates])
  const policy = getCancellationPolicy(cancellationPolicy)

  const totals = useMemo(
    () => calculateBookingTotal(pricing, guestCount, chargeDurationHours),
    [pricing, guestCount, chargeDurationHours]
  )

  const tiers = useMemo(
    () => [
      { label: "Solo", guests: 1 },
      { label: "2 guests", guests: 2 },
      { label: "3 guests", guests: 3 },
      { label: "4+ guests", guests: 4 },
    ],
    []
  )

  useEffect(() => {
    if (!selectedDate) {
      setBookedSlots([])
      return
    }
    const sessionDate = toDateInputValue(selectedDate)
    const loadBooked = async () => {
      const direct = await supabase
        .from("booked_slots")
        .select("start_time, end_time, status, created_at")
        .eq("listing_id", listingId)
        .eq("session_date", sessionDate)
      console.log("[booked_slots][raw direct rows]", {
        listingId,
        sessionDate,
        error: direct.error?.message ?? null,
        count: Array.isArray(direct.data) ? direct.data.length : 0,
        rows: direct.data,
      })

      if (!direct.error && Array.isArray(direct.data)) {
        const staleCutoffMs = Date.now() - 15 * 60 * 1000
        const normalizedDirect = direct.data.filter(
          (row): row is { start_time: string; end_time: string; status: string | null; created_at: string | null } =>
            typeof row.start_time === "string" && typeof row.end_time === "string"
        ).filter((row) => {
          const status = typeof row.status === "string" ? row.status : "confirmed"
          if (status === "confirmed") return true
          if (status !== "pending_payment") return false
          if (typeof row.created_at !== "string") return true
          const createdMs = new Date(row.created_at).getTime()
          return Number.isFinite(createdMs) && createdMs >= staleCutoffMs
        })
        console.log("[booked_slots][normalized direct rows]", {
          listingId,
          sessionDate,
          count: normalizedDirect.length,
          rows: normalizedDirect,
        })
        setBookedSlots(normalizedDirect)
        return
      }

      const fallback = await supabase
        .from("bookings")
        .select("start_time, end_time")
        .eq("listing_id", listingId)
        .eq("session_date", sessionDate)
        .in("status", ["pending_host", "pending", "confirmed", "completed"])
      console.log("[booked_slots][fallback bookings rows]", {
        listingId,
        sessionDate,
        error: fallback.error?.message ?? null,
        count: Array.isArray(fallback.data) ? fallback.data.length : 0,
        rows: fallback.data,
      })

      if (!fallback.error && Array.isArray(fallback.data)) {
        const normalizedFallback = fallback.data.filter(
          (row): row is { start_time: string; end_time: string } =>
            typeof row.start_time === "string" && typeof row.end_time === "string"
        )
        console.log("[booked_slots][normalized fallback rows]", {
          listingId,
          sessionDate,
          count: normalizedFallback.length,
          rows: normalizedFallback,
        })
        setBookedSlots(
          normalizedFallback
        )
      }
    }
    void loadBooked()
  }, [listingId, selectedDate, supabase])

  const slotStates = useMemo(() => {
    if (!selectedDate) return []
    const windows = availabilityWindowsForDay(availability, selectedDate)
    if (!windows.length) return []

    const now = new Date()
    const isSameDay = toDateInputValue(now) === toDateInputValue(selectedDate)
    const nowMins = now.getHours() * 60 + now.getMinutes()
    const slotStepMinutes = slotIncrement

    const overlapsBooked = (slotStart: number, slotEnd: number) =>
      bookedSlots.some((booked) => {
        const bookedStart = toMinutes(booked.start_time)
        const bookedEnd = toMinutes(booked.end_time)
        return bookedStart < slotEnd && bookedEnd > slotStart
      })

    const slots: Array<{
      startTime: string
      endTime: string
      label: string
      state: "available" | "selected" | "booked" | "too_late" | "past"
      tooltip?: string
    }> = []

    windows.forEach((window) => {
      // 08:00-20:00, 45-min raw -> 60-min slots
      // Result: 08:00, 09:00 ... 19:00 (13 slots)
      // 08:00-20:00, 30-min raw -> 30-min slots
      // Result: 08:00, 08:30 ... 19:30 (24 slots)
      // 08:00-20:00, 20-min raw -> 30-min slots
      // Result: 08:00, 08:30 ... 19:30 (24 slots)
      // 08:00-20:00, 75-min raw -> 90-min slots
      // Result: 08:00, 09:30, 11:00 ... 18:30 (9 slots)
      for (
        let slotStart = window.startMinutes;
        slotStart < window.endMinutes;
        slotStart += slotStepMinutes
      ) {
        if (slotStart + slotIncrement > window.endMinutes) continue
        const remaining = window.endMinutes - slotStart
        const slotEnd = slotStart + durationMinutes
        const startTime = fromMinutes(slotStart)
        const endTime = fromMinutes(Math.min(slotEnd, window.endMinutes))
        let state: "available" | "selected" | "booked" | "too_late" | "past" = "available"
        let tooltip: string | undefined

        if (isSameDay && slotStart <= nowMins) {
          state = "past"
        } else if (remaining < minMins || slotEnd > window.endMinutes) {
          state = "too_late"
          tooltip = "Not enough time for minimum session"
        } else if (overlapsBooked(slotStart, slotEnd)) {
          state = "booked"
          tooltip = "Already booked"
        }

        if (selectedStartTime === startTime && state === "available") {
          state = "selected"
        }

        slots.push({
          startTime,
          endTime,
          label: formatSlotLabel(startTime, endTime),
          state,
          tooltip,
        })
      }
    })
    return slots
  }, [availability, bookedSlots, durationMinutes, increment, listingId, minMins, selectedDate, selectedStartTime, slotIncrement])

  useEffect(() => {
    if (!slotStates.length) {
      setSelectedStartTime(null)
      return
    }
    const selectedStillValid = slotStates.some(
      (slot) => slot.startTime === selectedStartTime && (slot.state === "available" || slot.state === "selected")
    )
    if (selectedStartTime && !selectedStillValid) {
      setSelectedStartTime(null)
      setSlotNotice("Selected time no longer available for this duration — please choose another slot")
      return
    }
    if (!selectedStartTime) {
      const firstAvailable = slotStates.find((slot) => slot.state === "available")
      if (firstAvailable) setSelectedStartTime(firstAvailable.startTime)
    }
  }, [selectedStartTime, slotStates])

  const selectedSlots = useMemo(
    () => slotStates.filter((slot) => slot.state === "available" || slot.state === "selected"),
    [slotStates]
  )

  useEffect(() => {
    if (selectedDate) return
    const today = new Date()
    const todayKey = toDateInputValue(today)

    for (let dayOffset = 0; dayOffset <= 60; dayOffset += 1) {
      const candidate = new Date(today)
      candidate.setHours(0, 0, 0, 0)
      candidate.setDate(candidate.getDate() + dayOffset)
      const candidateKey = toDateInputValue(candidate)
      if (blackoutDateSet.has(candidateKey)) continue

      const windows = availabilityWindowsForDay(availability, candidate)
      if (!windows.length) continue

      const hasAnyValidSlot = windows.some((window) => {
        const earliestStart =
          candidateKey === todayKey
            ? Math.max(window.startMinutes, today.getHours() * 60 + today.getMinutes() + 1)
            : window.startMinutes
        return earliestStart + minMins <= window.endMinutes
      })
      if (hasAnyValidSlot) {
        setSelectedDate(candidate)
        return
      }
    }
  }, [availability, blackoutDateSet, minMins, selectedDate])

  function handleReserve() {
    const fallbackDate = new Date()
    fallbackDate.setDate(fallbackDate.getDate() + 1)
    const date = selectedDate ?? fallbackDate
    const slots = slotStates.filter((slot) => slot.state === "available" || slot.state === "selected")
    if (!slots.length) return
    const selected = slots.find((slot) => slot.startTime === selectedStartTime) ?? slots[0]

    const params = new URLSearchParams({
      date: toDateInputValue(date),
      guests: String(guestCount),
      duration: String(durationMinutes / 60),
      startTime: selected.startTime,
      endTime: selected.endTime,
    })

    trackGaEvent("begin_checkout", {
      listing_id: listingId,
      listing_title: listingTitle,
      service_type: serviceTypeId,
      city,
      value: totals.total,
      currency: "USD",
    })
    trackMetaEvent("InitiateCheckout", {
      content_ids: [listingId],
      content_type: "product",
      value: totals.total,
      currency: "USD",
      num_items: 1,
    }, {
      eventId: `initiate_checkout_${listingId}_${Date.now()}`,
    })

    router.push(`/book/${listingId}?${params.toString()}`)
  }

  async function handleNotifyMe() {
    setNotifyMessage(null)
    setIsNotifyLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/login?next=/listings/${listingId}`)
        return
      }

      const { error } = await supabase.from("listing_waitlist").upsert(
        {
          listing_id: listingId,
          user_id: user.id,
        },
        {
          onConflict: "listing_id,user_id",
          ignoreDuplicates: true,
        }
      )

      if (error) {
        throw error
      }

      setNotifyMessage("You're on the waitlist. We'll notify you when bookings open.")
    } catch {
      setNotifyMessage("Unable to save your request right now. Please try again.")
    } finally {
      setIsNotifyLoading(false)
    }
  }

  return (
    <Card className="card-base gap-4 py-4">
      <CardContent className="space-y-4 px-4">
        {!canReserve ? (
          <div className="rounded-lg border border-[#E6DDD3] bg-[#F8F4EF] p-3 text-sm text-[#5E4E42]">
            This listing is no longer accepting new bookings.
          </div>
        ) : null}
        {canReserve && !hostPayoutsReady ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            This host hasn&apos;t set up payouts yet. Booking is temporarily unavailable.
          </div>
        ) : null}
        <div>
          <p className="type-label">Pricing</p>
          <p className="type-price">
            {bookingModel === "fixed_session" ? (
              <>
                {formatMoney(pricing.price_solo)} <span className="text-base font-normal">/ session</span>
              </>
            ) : (
              <>
                from {formatMoney(pricing.price_solo)}{" "}
                <span className="text-base font-normal">/ person / hr</span>
              </>
            )}
          </p>
          {bookingModel === "fixed_session" ? (
            <p className="type-label mt-1">{fixedSessionLabel}</p>
          ) : null}
        </div>

        {bookingModel === "hourly" ? (
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">Group pricing</p>
            <div className="space-y-2 text-sm">
              {tiers.map((tier) => {
                const perPerson = getPricePerPerson(pricing, tier.guests)
                const baseline = pricing.price_solo * tier.guests
                const tierTotal = perPerson * tier.guests
                const savings =
                  baseline > 0 ? Math.max(0, Math.round(((baseline - tierTotal) / baseline) * 100)) : 0

                return (
                  <div key={tier.label} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{tier.label}</span>
                    <span className="font-medium">
                      {formatMoney(perPerson)}/pp {savings > 0 ? `(${savings}% off)` : ""}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium">Date</p>
          <div className="rounded-lg border">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => date < new Date() || blackoutDateSet.has(toDateInputValue(date))}
              modifiers={{
                blackout: (date) => blackoutDateSet.has(toDateInputValue(date)),
              }}
              modifiersClassNames={{
                blackout: "bg-zinc-100 text-zinc-500 line-through opacity-70",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Blocked dates are marked and unavailable (hover: Not available on this date).</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Available time slots</p>
          {selectedDate ? (
            selectedSlots.length ? (
              <>
                <TimeSlotPicker
                  slots={slotStates}
                  selectedStartTime={selectedStartTime}
                  onChange={(value) => {
                    setSelectedStartTime(value)
                    setSlotNotice(null)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Showing {selectedSlots.length} available slots for {formatNaturalDate(selectedDate)}
                </p>
                <p className="text-xs text-muted-foreground">{slotHelperText}</p>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p>No availability on this date. Try another date.</p>
                <Button variant="link" className="h-auto p-0 text-xs text-amber-900" onClick={() => setSelectedDate(undefined)}>
                  Try another date →
                </Button>
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Select a date to view available times.</p>
          )}
          {slotNotice ? <p className="text-xs text-amber-700">{slotNotice}</p> : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {bookingModel === "fixed_session" ? "People" : "Guests"}
          </p>
          <div
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              maxGuests === 1 ? "bg-[#F8F4EF]" : ""
            }`}
          >
            <span>
              {guestCount} {bookingModel === "fixed_session" ? "person" : "guest"}
              {guestCount > 1 ? "s" : ""}
            </span>
            {maxGuests > 1 ? (
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setGuestCount((v) => Math.max(1, v - 1))}
                  aria-label="Decrease guest count"
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setGuestCount((v) => Math.min(maxGuests, v + 1))}
                  aria-label="Increase guest count"
                >
                  <ChevronUp className="size-4" />
                </Button>
              </div>
            ) : (
              <span className="text-xs text-[#7A6A5D]">Fixed</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Max {maxGuests} {maxGuests === 1 ? "person" : "people"} per session</p>
        </div>

        <DurationSelector
          minMins={minMins}
          maxMins={maxMins}
          increment={increment}
          serviceType={serviceTypeId}
          selectedMinutes={durationMinutes}
          onChange={(minutes) => {
            setDurationMinutes(minutes)
            setSlotNotice(null)
          }}
        />

        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatMoney(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service fee (12%)</span>
            <span>{formatMoney(totals.serviceFee)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>{formatMoney(totals.total)}</span>
          </div>
        </div>

        {canReserve && hostPayoutsReady ? (
          <Button className="btn-primary w-full" onClick={handleReserve} disabled={!selectedSlots.length}>
            Reserve
          </Button>
        ) : canReserve ? (
          <Button className="w-full" variant="outline" onClick={handleNotifyMe} disabled={isNotifyLoading}>
            {isNotifyLoading ? "Saving..." : "Notify me"}
          </Button>
        ) : null}
        {notifyMessage ? <p className="text-center text-xs text-[#6D5E51]">{notifyMessage}</p> : null}
        <div className="flex items-start justify-center gap-2 text-center text-xs text-[#6D5E51]">
          <span>🛡</span>
          <span>{policy.tagline}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function ListingDetailClient({
  id,
  title,
  locationLabel,
  city,
  state,
  serviceTypeId,
  serviceTypeName,
  serviceTypeIcon,
  bookingModel,
  healthDisclaimer,
  saunaType,
  capacity,
  description,
  serviceAttributes,
  serviceDurationMin,
  serviceDurationMax,
  serviceDurationUnit,
  amenities,
  houseRules,
  host,
  photos,
  reviews,
  ratings,
  isHostView = false,
  pricing,
  availability,
  blackoutDates,
  durationConstraints,
  canReserve,
  hostPayoutsReady,
  cancellationPolicy,
  backToResultsPath = null,
}: ListingDetailProps) {
  const router = useRouter()
  const detailRef = useScrollReveal<HTMLDivElement>()
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest")
  const [chipFilter, setChipFilter] = useState<number | null>(null)
  const [summaryFilter, setSummaryFilter] = useState<number | null>(null)
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [showFullCancellationPolicy, setShowFullCancellationPolicy] = useState(false)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [hostBioExpanded, setHostBioExpanded] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const policy = getCancellationPolicy(cancellationPolicy)
  const hasCancellationPolicy = typeof cancellationPolicy === "string" && cancellationPolicy.trim().length > 0

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener("change", updateViewport)
    return () => mediaQuery.removeEventListener("change", updateViewport)
  }, [])

  const avgRating = ratings.avg_overall || (reviews.length
    ? reviews.reduce((acc, review) => acc + Number(review.rating_overall ?? 0), 0) / reviews.length
    : 0)

  const subRatingAverages = useMemo(() => {
    const rows = {
      cleanliness: reviews
        .map((review) => Number(review.rating_cleanliness ?? 0))
        .filter((value) => value > 0),
      accuracy: reviews.map((review) => Number(review.rating_accuracy ?? 0)).filter((value) => value > 0),
      communication: reviews
        .map((review) => Number(review.rating_communication ?? 0))
        .filter((value) => value > 0),
      value: reviews.map((review) => Number(review.rating_value ?? 0)).filter((value) => value > 0),
    }
    return {
      cleanliness: rows.cleanliness.length
        ? rows.cleanliness.reduce((sum, value) => sum + value, 0) / rows.cleanliness.length
        : 0,
      accuracy: rows.accuracy.length ? rows.accuracy.reduce((sum, value) => sum + value, 0) / rows.accuracy.length : 0,
      communication: rows.communication.length
        ? rows.communication.reduce((sum, value) => sum + value, 0) / rows.communication.length
        : 0,
      value: rows.value.length ? rows.value.reduce((sum, value) => sum + value, 0) / rows.value.length : 0,
    }
  }, [reviews])

  const starDistribution = useMemo(() => {
    const map: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const review of reviews) {
      const stars = Math.max(1, Math.min(5, Math.round(Number(review.rating_overall ?? 0))))
      map[stars] = (map[stars] ?? 0) + 1
    }
    return map
  }, [reviews])

  const recommendCount = reviews.filter((review) => review.recommended === true).length
  const wouldRecommendPercent = reviews.length ? Math.round((recommendCount / reviews.length) * 100) : 0

  const activeStars = summaryFilter ?? chipFilter

  const sortedReviews = useMemo(() => {
    const items = [...reviews]
    if (sortBy === "newest") {
      items.sort((a, b) => new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime())
    } else {
      items.sort((a, b) => new Date(a.created_at ?? "").getTime() - new Date(b.created_at ?? "").getTime())
    }

    if (activeStars) {
      return items.filter((review) => Math.round(Number(review.rating_overall ?? 0)) === activeStars)
    }
    return items
  }, [activeStars, reviews, sortBy])

  const visibleReviews = showAllReviews ? sortedReviews : sortedReviews.slice(0, 6)

  const hostName = host?.full_name || "thrml Host"
  const hostYear = host?.created_at ? new Date(host.created_at).getFullYear() : new Date().getFullYear()
  const hostInitials = initialsFromFullName(hostName)
  const hostResponseRate =
    typeof host?.response_rate === "number" && Number.isFinite(host.response_rate)
      ? Math.round(host.response_rate)
      : null
  const hostTotalReviews =
    typeof host?.total_reviews === "number" && Number.isFinite(host.total_reviews)
      ? Math.max(0, host.total_reviews)
      : 0
  const hostAverageRating =
    typeof host?.average_rating === "number" && Number.isFinite(host.average_rating)
      ? host.average_rating
      : null
  const showHostAsNew = hostTotalReviews === 0 || hostAverageRating === null
  const hostResponseTime =
    typeof host?.response_time === "string" && host.response_time.trim().length > 0
      ? host.response_time.trim()
      : typeof host?.response_time_hours === "number" && Number.isFinite(host.response_time_hours)
        ? host.response_time_hours <= 1
          ? "within an hour"
          : `within ${Math.round(host.response_time_hours)} hours`
        : null
  const hostBioFull = typeof host?.bio === "string" && host.bio.trim().length > 0 ? host.bio.trim() : null
  const hostBioPreview = hostBioFull ? truncateAtSentence(hostBioFull, isMobileViewport ? 80 : 120) : null
  const hostBioIsTruncated = Boolean(hostBioFull && hostBioPreview && hostBioPreview !== hostBioFull)
  const hostBioDisplay = hostBioExpanded ? hostBioFull : hostBioPreview
  const galleryPhotos = photos.slice(0, 3)
  const aboutHeading =
    {
      sauna: "About this sauna",
      cold_plunge: "About this cold plunge",
      hot_tub: "About this hot tub",
      infrared: "About this space",
      float_tank: "About this float tank",
      hyperbaric: "About this chamber",
      pemf: "About this session",
      halotherapy: "About this salt room",
    }[serviceTypeId] ?? "About this space"

  const hasSpecs = Boolean(
    serviceAttributes &&
      Object.values(serviceAttributes).some((value) => value !== null && value !== "" && value !== undefined)
  )
  const specRows = useMemo(() => {
    if (!hasSpecs) return []
    const config = SPEC_CONFIG[serviceTypeId] ?? []
    return config
      .map((field) => {
        const rawValue = serviceAttributes[field.key]
        if (rawValue === null || rawValue === undefined) return null
        if (typeof rawValue === "string" && rawValue.trim() === "") return null
        const normalizedValue =
          typeof rawValue === "string"
            ? rawValue.trim()
            : Array.isArray(rawValue)
              ? rawValue.join(", ")
              : String(rawValue)
        if (!normalizedValue) return null
        return {
          label: field.label,
          value: field.unit ? `${normalizedValue} ${field.unit}` : normalizedValue,
        }
      })
      .filter((row): row is { label: string; value: string } => Boolean(row))
  }, [hasSpecs, serviceAttributes, serviceTypeId])
  const specsGridClass =
    specRows.length === 1
      ? "grid grid-cols-1 gap-3"
      : specRows.length === 2
        ? "grid grid-cols-2 gap-3"
        : specRows.length === 3
          ? "grid grid-cols-1 gap-3 sm:grid-cols-3"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2"
  const validAmenities =
    AMENITIES_BY_SERVICE_TYPE[serviceTypeId] ?? AMENITIES_BY_SERVICE_TYPE.general
  const filteredAmenities = useMemo(
    () => (amenities ?? []).filter((amenity) => validAmenities.includes(amenity)),
    [amenities, validAmenities]
  )
  const listingPathWithReturn =
    backToResultsPath && backToResultsPath.startsWith("/explore")
      ? `/listings/${id}?from=${encodeURIComponent(backToResultsPath)}`
      : `/listings/${id}`

  useEffect(() => {
    trackGaEvent("view_item", {
      listing_id: id,
      item_name: title,
      item_category: serviceTypeId,
      city,
      value: pricing.price_solo ?? 0,
      currency: "USD",
    })
    trackMetaEvent("ViewContent", {
      content_ids: [id],
      content_type: "product",
      content_name: title,
      content_category: serviceTypeId,
      value: pricing.price_solo ?? 0,
      currency: "USD",
    }, {
      eventId: `view_content_${id}_${Date.now()}`,
    })
  }, [city, id, pricing.price_solo, serviceTypeId, title])

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <section className="mb-6 space-y-3 border-b pb-6">
          <button
            type="button"
            onClick={() => {
              if (backToResultsPath && backToResultsPath.startsWith("/explore")) {
                router.push(backToResultsPath)
                return
              }
              if (window.history.length > 1) {
                router.back()
                return
              }
              router.push("/explore")
            }}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md text-sm font-medium text-[#5D4D41]"
          >
            <ChevronLeft className="size-4" />
            Back to results
          </button>
          <div className="space-y-2">
            <div>
              <h1 className="type-h1">{title}</h1>
              <p className="type-label">{locationLabel}</p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <span className="mr-1">{serviceTypeIcon}</span>
                  {serviceTypeName}
                </Badge>
                {saunaType ? <Badge variant="secondary">{saunaType}</Badge> : null}
                {capacity ? <Badge variant="secondary">Up to {capacity} guests</Badge> : null}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-4">
                <ShareButton
                  variant="detail"
                  listing={{
                    id,
                    title,
                    service_type: serviceTypeId,
                  }}
                />
                <SaveButton
                  listingId={id}
                  variant="detail"
                  listingMeta={{ serviceType: serviceTypeId, city }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="md:hidden">
            <div
              className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto"
              onScroll={(event) => {
                const element = event.currentTarget
                const index = Math.round(element.scrollLeft / Math.max(element.clientWidth, 1))
                setActivePhotoIndex(Math.max(0, Math.min(index, photos.length - 1)))
              }}
            >
              {photos.map((photo, index) => (
                <div key={`${photo.url}-${index}`} className="w-full shrink-0 snap-start">
                  <img
                    src={photo.url}
                    alt={`${title} — photo ${index + 1}`}
                    className="aspect-[4/3] w-full object-cover object-center"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              {photos.length <= 5 ? (
                photos.map((photo, index) => (
                  <span
                    key={`${photo.url}-dot-${index}`}
                    className={`h-2 w-2 rounded-full ${index === activePhotoIndex ? "bg-[#8B4513]" : "bg-[#D9CEC1]"}`}
                  />
                ))
              ) : (
                <span className="text-xs text-[#6D5E51]">
                  {activePhotoIndex + 1}/{photos.length}
                </span>
              )}
            </div>
          </div>
          <div className="hidden md:block">
            {photos.length === 1 ? (
            <div className="overflow-hidden rounded-2xl">
              <img
                src={photos[0].url}
                alt={`${title} — photo 1`}
                className="aspect-[16/9] w-full object-cover object-center"
              />
            </div>
            ) : photos.length === 2 ? (
            <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-2xl">
              {photos.slice(0, 2).map((photo, index) => (
                <img
                  key={`${photo.url}-${index}`}
                  src={photo.url}
                  alt={`${title} — photo ${index + 1}`}
                  className="aspect-[4/3] w-full object-cover object-center"
                />
              ))}
            </div>
          ) : (
            <div className="relative grid max-h-[480px] grid-cols-[3fr_2fr] gap-2 overflow-hidden rounded-2xl">
              <img
                src={galleryPhotos[0]?.url}
                alt={`${title} — photo 1`}
                className="aspect-[4/3] h-full w-full object-cover object-center"
              />
              <div className="grid gap-2">
                {galleryPhotos.slice(1, 3).map((photo, index) => (
                  <img
                    key={`${photo.url}-${index + 1}`}
                    src={photo.url}
                    alt={`${title} — photo ${index + 2}`}
                    className="aspect-[4/3] h-full w-full object-cover object-center"
                  />
                ))}
              </div>
              {photos.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setShowAllPhotos(true)}
                  className="absolute bottom-4 right-4 rounded-lg border border-[#E5DDD6] bg-white px-[14px] py-2 text-[13px] font-medium shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                >
                  Show all {photos.length} photos
                </button>
              ) : null}
            </div>
            )}
          </div>

          <Dialog open={showAllPhotos} onOpenChange={setShowAllPhotos}>
            <DialogContent className="h-[95vh] max-w-5xl overflow-hidden p-0" showCloseButton={false}>
              <DialogHeader className="border-b border-[#EFE5DA] px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <DialogTitle className="text-base font-semibold text-[#1A1410]">{title} photos</DialogTitle>
                  <button
                    type="button"
                    onClick={() => setShowAllPhotos(false)}
                    className="rounded-md border border-[#E5DDD6] px-3 py-1.5 text-sm font-medium text-[#4B3F36]"
                  >
                    Close
                  </button>
                </div>
              </DialogHeader>
              <div className="h-full overflow-y-auto bg-[#FCFAF7] px-4 py-4 sm:px-6">
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                  {photos.map((photo, index) => (
                    <img
                      key={`${photo.url}-${index}`}
                      src={photo.url}
                      alt={`${title} — photo ${index + 1}`}
                      className="w-full rounded-xl object-cover object-center"
                    />
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

        </section>

        <div ref={detailRef} className="grid gap-10 md:grid-cols-[minmax(0,2fr)_380px]">
          <main className="space-y-8">
            <section className="space-y-3 border-b pb-8 reveal">
              <h2 className="type-h2">{aboutHeading}</h2>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {description || "No description provided yet."}
              </p>
            </section>

            <section className="space-y-4 border-b pb-8 reveal stagger-3">
              <div className="flex items-center justify-between">
                <h2 className="type-h2">Hosted by</h2>
                {host?.is_superhost ? <Badge>Superhost</Badge> : null}
              </div>
              {host?.id ? (
                <Link href={`/hosts/${host.id}?from=${encodeURIComponent(listingPathWithReturn)}`} className="block">
                  <Card className="rounded-xl border border-[#E6DDD3] bg-[#FCFAF7] py-4 shadow-none transition hover:bg-[#F8F4EE]">
                    <CardContent className="px-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="size-14 ring-1 ring-[#C75B3A33]">
                          <AvatarImage src={host?.avatar_url || undefined} alt={hostName} />
                          <AvatarFallback className="bg-[#C75B3A1F] text-[#5D4D41]">
                            {hostInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-[17px] font-semibold text-[#1A1410]">{hostName}</p>
                          <p className="text-sm text-muted-foreground">Hosted since {hostYear}</p>
                          {showHostAsNew ? (
                            <span className="mt-1 inline-flex rounded-full bg-[#FDEBDD] px-2 py-0.5 text-xs text-[#C75B3A]">New</span>
                          ) : (
                            <p className="mt-1 text-sm text-muted-foreground">★ {hostAverageRating.toFixed(1)} ({hostTotalReviews})</p>
                          )}
                          {hostResponseRate !== null ? (
                            <p className="mt-1 text-sm text-muted-foreground">Response rate: {hostResponseRate}%</p>
                          ) : null}
                          {typeof host?.response_time_hours === "number" ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Response time: {hostResponseTime ?? `${Math.round(host.response_time_hours)} hours`}
                            </p>
                          ) : null}
                          {hostBioDisplay ? (
                            <div className="mt-1">
                              <p className="text-sm text-[#5D4D41]">{hostBioDisplay}</p>
                              {hostBioIsTruncated ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setHostBioExpanded((current) => !current)
                                  }}
                                  className="mt-1 text-sm font-medium text-[#8B4513] hover:underline"
                                >
                                  {hostBioExpanded ? "Show less" : "Read more"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <span className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-medium text-[#5D4D41]">View profile →</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card className="rounded-xl border border-[#E6DDD3] bg-[#FCFAF7] py-4 shadow-none">
                  <CardContent className="px-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="size-14 ring-1 ring-[#C75B3A33]">
                        <AvatarImage src={host?.avatar_url || undefined} alt={hostName} />
                        <AvatarFallback className="bg-[#C75B3A1F] text-[#5D4D41]">
                          {hostInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-semibold text-[#1A1410]">{hostName}</p>
                        <p className="text-sm text-muted-foreground">Hosted since {hostYear}</p>
                        {showHostAsNew ? (
                          <span className="mt-1 inline-flex rounded-full bg-[#FDEBDD] px-2 py-0.5 text-xs text-[#C75B3A]">New</span>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">★ {hostAverageRating.toFixed(1)} ({hostTotalReviews})</p>
                        )}
                        {hostResponseRate !== null ? (
                          <p className="mt-1 text-sm text-muted-foreground">Response rate: {hostResponseRate}%</p>
                        ) : null}
                        {typeof host?.response_time_hours === "number" ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Response time: {hostResponseTime ?? `${Math.round(host.response_time_hours)} hours`}
                          </p>
                        ) : null}
                        {hostBioDisplay ? (
                          <div className="mt-1">
                            <p className="text-sm text-[#5D4D41]">{hostBioDisplay}</p>
                            {hostBioIsTruncated ? (
                              <button
                                type="button"
                                onClick={() => setHostBioExpanded((current) => !current)}
                                className="mt-1 text-sm font-medium text-[#8B4513] hover:underline"
                              >
                                {hostBioExpanded ? "Show less" : "Read more"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <span className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-medium text-[#5D4D41]">View profile →</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            {specRows.length ? (
              <section className="space-y-4 border-b pb-8">
                <h2 className="type-h2">Specs</h2>
                <div className={specsGridClass}>
                  {specRows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-[#EFE5DA] bg-[#FCFAF7] p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#7A6A5D]">{row.label}</p>
                      <p className="mt-1 text-sm text-[#1A1410]">{row.value}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {healthDisclaimer ? (
              <section className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
                <p className="text-sm text-yellow-900">
                  <span className="font-medium">Disclaimers:</span> {healthDisclaimer}
                </p>
              </section>
            ) : null}

            {filteredAmenities.length ? (
              <section className="space-y-4 border-b pb-8 reveal stagger-1">
                <h2 className="type-h2">Amenities</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredAmenities.map((amenity) => {
                    const Icon = amenityIcon(amenity)
                    return (
                      <div key={amenity} className="flex items-center gap-2">
                        <Icon className="size-4" />
                        <span>{amenity}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            <section className="space-y-4 border-b pb-8">
              <h2 className="type-h2">House rules</h2>
              <ul className="space-y-2 text-muted-foreground">
                {houseRules.map((rule, index) => (
                  <li key={`${rule}-${index}`} className="flex gap-2">
                    <span>•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </section>

            {hasCancellationPolicy ? (
              <section className="space-y-4 border-b pb-8">
                <h2 className="type-h2">Cancellation policy</h2>
                <p className="text-sm text-[#5D4D41]">{policy.description}</p>
                <div className="rounded-lg border border-[#E5DDD6] bg-[#FCFAF7] p-4">
                  <ul className="space-y-2 text-sm text-[#4B3F36]">
                    <li className="flex gap-2">
                      <span>•</span>
                      <span>{policy.bulletPoints[0]}</span>
                    </li>
                    {showFullCancellationPolicy
                      ? policy.bulletPoints.slice(1).map((point) => (
                          <li key={point} className="flex gap-2">
                            <span>•</span>
                            <span>{point}</span>
                          </li>
                        ))
                      : null}
                  </ul>
                  <button
                    type="button"
                    className="mt-3 text-sm font-medium text-[#8C5336]"
                    onClick={() => setShowFullCancellationPolicy((current) => !current)}
                  >
                    {showFullCancellationPolicy ? "Show less ▴" : "Show full policy ▾"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cancellation windows are calculated from the session start time in the local timezone of the
                  listing.
                </p>
              </section>
            ) : null}

            <section id="reviews" className="space-y-4 scroll-mt-28 pb-2 reveal stagger-2">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-serif text-[22px] text-[#1A1410]">
                  ★ {avgRating ? avgRating.toFixed(2) : "0.00"} · {ratings.review_count || reviews.length} reviews
                </h2>
                <button
                  type="button"
                  onClick={() => setSortBy((current) => (current === "newest" ? "oldest" : "newest"))}
                  aria-label={`Sort reviews: ${sortBy === "newest" ? "newest first" : "oldest first"}. Click to toggle.`}
                  title={sortBy === "newest" ? "Newest first" : "Oldest first"}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[#2F251E] transition-colors hover:text-[#1A1410] focus-visible:outline-none focus-visible:ring-0"
                >
                  {sortBy === "newest" ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                </button>
              </div>

              {reviews.length ? (
                <>
                  <RatingSummary
                    avgOverall={avgRating}
                    reviewCount={ratings.review_count || reviews.length}
                    averages={subRatingAverages}
                    wouldRecommendPercent={wouldRecommendPercent}
                    starDistribution={starDistribution}
                    activeStarFilter={summaryFilter}
                    onStarFilterChange={setSummaryFilter}
                  />

                  {reviews.length >= 10 ? (
                    <div className="flex flex-wrap gap-2">
                      {([null, 5, 4, 3, 2, 1] as Array<number | null>).map((value) => {
                        const active = chipFilter === value || (value === null && chipFilter === null)
                        return (
                          <button
                            key={String(value ?? "all")}
                            type="button"
                            onClick={() => setChipFilter(value)}
                            className={`rounded-full px-3 py-1.5 text-sm ${
                              active ? "bg-[#1A1410] text-white" : "border border-[#DED3C7] bg-white text-[#5E4E42]"
                            }`}
                          >
                            {value === null ? "All ★" : `${value} ★`}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  <div className={`grid gap-x-6 transition-all duration-300 md:grid-cols-2`}>
                    {visibleReviews.map((review, index) => (
                      <div
                        key={review.id}
                        className={`border-[#F0E7DD] pb-1 ${index < visibleReviews.length - 2 ? "border-b" : ""}`}
                      >
                        <ReviewCard
                          review={review}
                          isHostView={isHostView}
                          highlightPending={isHostView}
                        />
                      </div>
                    ))}
                  </div>

                  {!showAllReviews && sortedReviews.length > 6 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllReviews(true)}
                      className="rounded-xl border border-[#DECFBF] bg-white px-4 py-2 text-sm text-[#5D4D41]"
                    >
                      Show all {sortedReviews.length} reviews
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="py-8 text-center text-sm text-[#8B7B6D]">
                  No reviews yet · Be the first to review this space after your visit
                </p>
              )}
            </section>
          </main>

          <aside className="hidden md:block">
            <div className="sticky top-6">
              <BookingWidget
                pricing={pricing}
                listingId={id}
                listingTitle={title}
                city={city}
                state={state}
                bookingModel={bookingModel}
                serviceTypeName={serviceTypeName}
                serviceDurationMin={serviceDurationMin}
                serviceDurationMax={serviceDurationMax}
                serviceDurationUnit={serviceDurationUnit}
                availability={availability}
                blackoutDates={blackoutDates}
                serviceTypeId={serviceTypeId}
                durationConstraints={durationConstraints}
                capacity={capacity}
                canReserve={canReserve}
                hostPayoutsReady={hostPayoutsReady}
                cancellationPolicy={cancellationPolicy}
              />
            </div>
          </aside>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5DDD6] bg-background/95 px-4 py-3 backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">from</p>
            <p className="font-semibold">{formatMoney(pricing.price_solo)} / person / hr</p>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="btn-primary" disabled={!canReserve || !hostPayoutsReady}>
                {canReserve && !hostPayoutsReady ? "Notify me" : "Reserve"}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-[24px]">
              <SheetHeader>
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#E5DDD6]" />
                <SheetTitle>Reserve your session</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <BookingWidget
                  pricing={pricing}
                  listingId={id}
                  listingTitle={title}
                  city={city}
                  state={state}
                  bookingModel={bookingModel}
                  serviceTypeName={serviceTypeName}
                  serviceDurationMin={serviceDurationMin}
                  serviceDurationMax={serviceDurationMax}
                  serviceDurationUnit={serviceDurationUnit}
                  availability={availability}
                  blackoutDates={blackoutDates}
                  serviceTypeId={serviceTypeId}
                  durationConstraints={durationConstraints}
                  capacity={capacity}
                  canReserve={canReserve}
                  hostPayoutsReady={hostPayoutsReady}
                  cancellationPolicy={cancellationPolicy}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  )
}
