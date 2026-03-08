"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Handshake, KeyRound, Lock, MoreHorizontal, Smartphone, Trash2, User } from "lucide-react"

import { AMENITIES_BY_SERVICE_TYPE } from "@/lib/constants/amenities"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  CANCELLATION_POLICIES,
  getCancellationPolicy,
} from "@/lib/constants/cancellation-policies"
import {
  ACCESS_TYPES,
  CODE_SEND_TIMING,
  INSTRUCTION_VARIABLES,
  resolveInstructions,
  type AccessTypeKey,
  type CodeSendTimingKey,
} from "@/lib/constants/access-types"
import { resolveHouseRules } from "@/lib/constants/default-house-rules"
import { SERVICE_TYPES } from "@/lib/constants/service-types"

type ListingEditModel = {
  id: string
  title: string
  description: string
  serviceType: string
  location: string
  amenities: string[]
  priceSolo: number
  capacity: number
  cancellationPolicy: string
  instantBook: boolean
  isActive: boolean
  parentListingId: string | null
  version: number
  timeSlotIncrement: number
  serviceDurationMin: number | null
  serviceDurationMax: number | null
  serviceDurationUnit: "minutes" | "hours"
  accessType: string
  accessCodeTemplate: string
  accessCodeType: string
  accessInstructions: string
  accessCodeSendTiming: string
  houseRules: string[]
  houseRulesCustom: string | null
}

type BlackoutDate = {
  blackout_date: string
  reason: string | null
  created_at: string | null
}

const ACCESS_ICON_MAP = {
  KeyRound,
  Lock,
  Handshake,
  Smartphone,
  User,
} as const

const ACCESS_INSTRUCTION_PLACEHOLDERS: Record<AccessTypeKey, string> = {
  code: "Enter through the side gate. The keypad is on the left. Code: [CODE]",
  lockbox: "Lockbox is on the front fence. Combo: [CODE]. Please return the key when done.",
  keypick: "Text me when you arrive and I'll meet you at the front door.",
  smart_lock: "A unique code will be sent automatically before your session.",
  host_present: "I'll be there to let you in. Feel free to message if you need anything.",
}

function DisplayRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-[#E9DFD3] bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-[#8A7B6D]">{label}</p>
      <p className="text-sm text-[#1A1410]">{value || "—"}</p>
    </div>
  )
}

export function EditListingClient({
  listing,
  activeBookingCount,
  fromClone,
  originalTitleHint,
  parentTitle,
}: {
  listing: ListingEditModel
  activeBookingCount: number
  fromClone: boolean
  originalTitleHint: string | null
  parentTitle: string | null
}) {
  const router = useRouter()
  const normalizedCancellationPolicy = (() => {
    const value = String(listing.cancellationPolicy ?? "").trim().toLowerCase()
    if (value === "flexible" || value === "moderate" || value === "strict") return value
    return "flexible"
  })()
  const [form, setForm] = useState({
    title: listing.title,
    description: listing.description,
    serviceType: listing.serviceType,
    location: listing.location,
    amenities: listing.amenities,
    priceSolo: String(listing.priceSolo || ""),
    capacity: String(listing.capacity || 1),
    cancellationPolicy: normalizedCancellationPolicy,
    instantBook: listing.instantBook,
    timeSlotIncrement: String(listing.timeSlotIncrement || 30),
    serviceDurationMin: listing.serviceDurationMin ? String(listing.serviceDurationMin) : "",
    serviceDurationMax: listing.serviceDurationMax ? String(listing.serviceDurationMax) : "",
    serviceDurationUnit: listing.serviceDurationUnit,
    accessType: (listing.accessType in ACCESS_TYPES ? listing.accessType : "code") as AccessTypeKey,
    accessCodeTemplate: listing.accessCodeTemplate ?? "",
    accessCodeType: listing.accessCodeType === "dynamic" ? "dynamic" : "static",
    accessInstructions: listing.accessInstructions ?? "",
    accessCodeSendTiming: (listing.accessCodeSendTiming in CODE_SEND_TIMING
      ? listing.accessCodeSendTiming
      : "24h_before") as CodeSendTimingKey,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showDeactivate, setShowDeactivate] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [publishing, setPublishing] = useState<null | "replace" | "only">(null)
  const [blackoutDates, setBlackoutDates] = useState<BlackoutDate[]>([])
  const [blackoutLoading, setBlackoutLoading] = useState(true)
  const [blackoutStartDate, setBlackoutStartDate] = useState("")
  const [blackoutEndDate, setBlackoutEndDate] = useState("")
  const [blackoutReason, setBlackoutReason] = useState("")
  const [blackoutSaving, setBlackoutSaving] = useState(false)
  const [removingDate, setRemovingDate] = useState<string | null>(null)
  const [accessSaveState, setAccessSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [accessSaveError, setAccessSaveError] = useState<string | null>(null)
  const [savedAccessCodeTemplate, setSavedAccessCodeTemplate] = useState(
    (listing.accessCodeTemplate ?? "").slice(0, 20)
  )
  const [accessCodeSaveState, setAccessCodeSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const accessCodeSaveTimeoutRef = useRef<number | null>(null)
  const [instructionsCursor, setInstructionsCursor] = useState(0)
  const instructionsRef = useRef<HTMLTextAreaElement | null>(null)

  const locked = activeBookingCount > 0
  const originalTitle = parentTitle ?? originalTitleHint ?? "the original listing"
  const canPublishReplacement = Boolean(listing.parentListingId)
  const selectedCancellationPolicy = getCancellationPolicy(form.cancellationPolicy)
  const accessConfig = ACCESS_TYPES[form.accessType]
  const accessCodePlaceholder = form.accessType === "lockbox" ? "e.g. A-394" : "e.g. 4829"
  const resolvedInstructionPreview = resolveInstructions(form.accessInstructions || "", {
    code: form.accessCodeTemplate || "",
    date: "March 9, 2026",
    time: "2:00 PM",
    guestName: "Guest",
    duration: "60 minutes",
  })
  const { isDefault: usingDefaultHouseRules } = resolveHouseRules(
    listing.houseRules,
    listing.houseRulesCustom
  )
  const configuredHouseRuleCount = Array.isArray(listing.houseRules) ? listing.houseRules.length : 0

  const validAmenities =
    AMENITIES_BY_SERVICE_TYPE[form.serviceType] ?? AMENITIES_BY_SERVICE_TYPE.general
  const cleanAmenities = useMemo(
    () => form.amenities.filter((item) => validAmenities.includes(item)),
    [form.amenities, validAmenities]
  )

  const blackoutDateSet = useMemo(
    () => new Set(blackoutDates.map((item) => item.blackout_date)),
    [blackoutDates]
  )

  useEffect(() => {
    let isMounted = true
    const loadBlackouts = async () => {
      setBlackoutLoading(true)
      const response = await fetch(`/api/listings/${listing.id}/blackout`)
      const payload = (await response.json()) as { blackoutDates?: BlackoutDate[]; error?: string }
      if (!isMounted) return
      if (response.ok) {
        const rows = Array.isArray(payload.blackoutDates) ? payload.blackoutDates : []
        setBlackoutDates(rows)
      }
      setBlackoutLoading(false)
    }
    void loadBlackouts()
    return () => {
      isMounted = false
    }
  }, [listing.id])

  useEffect(() => {
    return () => {
      if (accessCodeSaveTimeoutRef.current) {
        window.clearTimeout(accessCodeSaveTimeoutRef.current)
      }
    }
  }, [])

  function localDateToIso(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  function getDateRange(startDateIso: string, endDateIso: string) {
    const out: string[] = []
    const cursor = new Date(`${startDateIso}T00:00:00`)
    const end = new Date(`${endDateIso}T00:00:00`)
    while (cursor <= end) {
      out.push(localDateToIso(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }

  async function saveAccessPatch(patch: Record<string, unknown>) {
    if (locked) return
    setAccessSaveState("saving")
    setAccessSaveError(null)
    const response = await fetch(`/api/listings/${listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    const payload = (await response.json()) as { error?: string }
    if (!response.ok) {
      setAccessSaveState("error")
      setAccessSaveError(payload.error ?? "Unable to save access settings.")
      return
    }
    setAccessSaveState("saved")
    window.setTimeout(() => {
      setAccessSaveState((current) => (current === "saved" ? "idle" : current))
    }, 1800)
  }

  async function handleAccessTypeChange(nextType: AccessTypeKey) {
    setForm((current) => ({
      ...current,
      accessType: nextType,
      accessInstructions: current.accessInstructions || ACCESS_INSTRUCTION_PLACEHOLDERS[nextType],
    }))
    await saveAccessPatch({ access_type: nextType })
  }

  async function handleSendTimingChange(nextTiming: CodeSendTimingKey) {
    setForm((current) => ({ ...current, accessCodeSendTiming: nextTiming }))
    await saveAccessPatch({ access_code_send_timing: nextTiming })
  }

  async function handleAccessCodeTypeChange(nextType: "static" | "dynamic") {
    setForm((current) => ({ ...current, accessCodeType: nextType }))
    await saveAccessPatch({ access_code_type: nextType })
  }

  function updateAccessCodeSaveState(state: "idle" | "saving" | "saved" | "error") {
    if (accessCodeSaveTimeoutRef.current) {
      window.clearTimeout(accessCodeSaveTimeoutRef.current)
      accessCodeSaveTimeoutRef.current = null
    }
    setAccessCodeSaveState(state)
    if (state === "saved") {
      accessCodeSaveTimeoutRef.current = window.setTimeout(() => {
        setAccessCodeSaveState((current) => (current === "saved" ? "idle" : current))
        accessCodeSaveTimeoutRef.current = null
      }, 2000)
    }
  }

  async function saveAccessCodeTemplate() {
    const nextValue = form.accessCodeTemplate.trim().slice(0, 20)
    if (nextValue === savedAccessCodeTemplate) return
    if (locked) return
    updateAccessCodeSaveState("saving")
    setAccessSaveError(null)
    const response = await fetch(`/api/listings/${listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_code_template: nextValue }),
    })
    const payload = (await response.json()) as { error?: string }
    if (!response.ok) {
      updateAccessCodeSaveState("error")
      setAccessSaveError(payload.error ?? "Unable to save access settings.")
      return
    }
    setForm((current) => ({ ...current, accessCodeTemplate: nextValue }))
    setSavedAccessCodeTemplate(nextValue)
    updateAccessCodeSaveState("saved")
  }

  async function saveAccessInstructions() {
    await saveAccessPatch({ access_instructions: form.accessInstructions.trim().slice(0, 500) })
  }

  function insertVariable(variable: string) {
    const input = instructionsRef.current
    const start = input?.selectionStart ?? instructionsCursor
    const end = input?.selectionEnd ?? instructionsCursor
    setForm((current) => {
      const before = current.accessInstructions.slice(0, start)
      const after = current.accessInstructions.slice(end)
      return {
        ...current,
        accessInstructions: `${before}${variable}${after}`.slice(0, 500),
      }
    })
    const nextCursor = Math.min(start + variable.length, 500)
    setInstructionsCursor(nextCursor)
    window.setTimeout(() => {
      input?.focus()
      input?.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

  async function saveChanges() {
    if (locked) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    const response = await fetch(`/api/listings/${listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        service_type: form.serviceType,
        location: form.location,
        amenities: cleanAmenities,
        price_solo: Number(form.priceSolo || 0),
        capacity: Number(form.capacity || 1),
        cancellation_policy: form.cancellationPolicy,
        is_instant_book: form.instantBook,
        min_duration_override_minutes: Math.max(30, Number(form.timeSlotIncrement || 30)),
        fixed_session_minutes: Math.max(30, Number(form.timeSlotIncrement || 30)),
        service_duration_min: form.serviceDurationMin ? Number(form.serviceDurationMin) : null,
        service_duration_max: form.serviceDurationMax ? Number(form.serviceDurationMax) : null,
        service_duration_unit: form.serviceDurationUnit,
      }),
    })
    const payload = (await response.json()) as { error?: string }
    setSaving(false)
    if (!response.ok) {
      setError(payload.error ?? "Unable to save listing.")
      return
    }
    setSuccess("Changes saved.")
    router.refresh()
  }

  async function createNewVersion() {
    setError(null)
    const response = await fetch(`/api/listings/${listing.id}/clone`, { method: "POST" })
    const payload = (await response.json()) as { listingId?: string; originalTitle?: string; error?: string }
    if (!response.ok || !payload.listingId) {
      setError(payload.error ?? "Unable to create new version.")
      return
    }
    const title = encodeURIComponent(payload.originalTitle ?? listing.title ?? "Original listing")
    router.push(`/dashboard/listings/${payload.listingId}/edit?fromClone=1&originalTitle=${title}`)
  }

  async function deactivateListing() {
    setDeactivating(true)
    setError(null)
    const response = await fetch(`/api/listings/${listing.id}/deactivate`, { method: "PATCH" })
    const payload = (await response.json()) as { error?: string }
    setDeactivating(false)
    if (!response.ok) {
      setError(payload.error ?? "Unable to deactivate listing.")
      return
    }
    setShowDeactivate(false)
    router.push("/dashboard/listings")
    router.refresh()
  }

  async function publishVersion(replaceOriginal: boolean) {
    setPublishing(replaceOriginal ? "replace" : "only")
    setError(null)
    const response = await fetch(`/api/listings/${listing.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deactivateOriginal: replaceOriginal }),
    })
    const payload = (await response.json()) as { error?: string }
    setPublishing(null)
    if (!response.ok) {
      setError(payload.error ?? "Unable to publish listing.")
      return
    }
    router.push("/dashboard/listings?published=1")
    router.refresh()
  }

  async function addBlackoutDates() {
    setError(null)
    setSuccess(null)
    if (locked) return

    const start = blackoutStartDate
    const end = blackoutEndDate || blackoutStartDate
    if (!start || !end) {
      setError("Select a date or range to block.")
      return
    }
    if (end < start) {
      setError("End date must be on or after start date.")
      return
    }

    setBlackoutSaving(true)
    const dates = getDateRange(start, end)
    let firstError: string | null = null
    for (const date of dates) {
      const response = await fetch(`/api/listings/${listing.id}/blackout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          reason: blackoutReason.trim() || undefined,
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        firstError = payload.error ?? `Unable to block ${date}.`
        break
      }
    }

    setBlackoutSaving(false)
    if (firstError) {
      setError(firstError)
      return
    }

    const refreshResponse = await fetch(`/api/listings/${listing.id}/blackout`)
    const refreshPayload = (await refreshResponse.json()) as { blackoutDates?: BlackoutDate[] }
    setBlackoutDates(Array.isArray(refreshPayload.blackoutDates) ? refreshPayload.blackoutDates : [])
    setBlackoutReason("")
    setSuccess(dates.length > 1 ? `${dates.length} blackout dates added.` : "Blackout date added.")
  }

  async function removeBlackoutDate(date: string) {
    setError(null)
    setSuccess(null)
    setRemovingDate(date)
    const response = await fetch(`/api/listings/${listing.id}/blackout/${date}`, {
      method: "DELETE",
    })
    const payload = (await response.json()) as { error?: string }
    setRemovingDate(null)
    if (!response.ok) {
      setError(payload.error ?? "Unable to remove blackout date.")
      return
    }
    setBlackoutDates((current) => current.filter((item) => item.blackout_date !== date))
    setSuccess("Blackout date removed.")
  }

  return (
    <div className="space-y-5 px-4 py-6 md:px-8 md:py-8">
      <Link
        href="/dashboard/listings"
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-[#5D4D41] hover:underline"
      >
        ← Back to listings
      </Link>
      {locked ? (
        <div className="sticky top-3 z-20 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            This listing has {activeBookingCount} upcoming booking(s) and cannot be edited. To make changes, create a
            new version — your current bookings won&apos;t be affected.
          </p>
          <Button className="mt-3 bg-amber-600 text-white hover:bg-amber-700" onClick={createNewVersion}>
            Create new version →
          </Button>
        </div>
      ) : null}

      {fromClone ? (
        <div className="rounded-xl border border-[#E8D6C5] bg-[#FFF8F0] p-3 text-sm text-[#6A5848]">
          Editing a new version of {originalTitle}. Your original listing stays live until you publish this one.
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#1A1410]">Edit listing</h1>
          <p className="text-sm text-[#7A6A5D]">
            {listing.title || "Untitled listing"} {listing.version > 1 ? `(v${listing.version})` : ""}
          </p>
        </div>

        {!locked ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowDeactivate(true)}>Deactivate listing</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {locked ? (
          <>
            <DisplayRow label="Title" value={form.title} />
            <DisplayRow label="Service Type" value={form.serviceType} />
            <DisplayRow label="Location" value={form.location} />
            <DisplayRow label="Price (solo)" value={form.priceSolo ? `$${form.priceSolo}` : ""} />
            <DisplayRow label="Capacity" value={form.capacity} />
            <DisplayRow label="Cancellation" value={selectedCancellationPolicy.label} />
            <DisplayRow label="Instant book" value={form.instantBook ? "Enabled" : "Disabled"} />
            <DisplayRow label="Amenities" value={cleanAmenities.join(", ")} />
            <div className="md:col-span-2">
              <DisplayRow label="Description" value={form.description} />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(event) => setForm((s) => ({ ...s, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Service Type</Label>
              <Select
                value={form.serviceType}
                onValueChange={(nextServiceType) => {
                  const nextValidAmenities =
                    AMENITIES_BY_SERVICE_TYPE[nextServiceType] ?? AMENITIES_BY_SERVICE_TYPE.general
                  setForm((current) => ({
                    ...current,
                    serviceType: nextServiceType,
                    amenities: current.amenities.filter((amenity) => nextValidAmenities.includes(amenity)),
                  }))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((serviceType) => (
                    <SelectItem key={serviceType.value} value={serviceType.value}>
                      {serviceType.emoji} {serviceType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={(event) => setForm((s) => ({ ...s, location: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Amenities</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {validAmenities.map((amenity) => {
                  const checked = form.amenities.includes(amenity)
                  return (
                    <label
                      key={amenity}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked ? "border-[#C75B3A] bg-[#FFF3EC]" : "border-[#E9DFD3] bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((current) => {
                            const nextAmenities = checked
                              ? current.amenities.filter((item) => item !== amenity)
                              : [...current.amenities, amenity]
                            return { ...current, amenities: nextAmenities }
                          })
                        }
                      />
                      <span>{amenity}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Price solo</Label>
              <Input
                type="number"
                value={form.priceSolo}
                onChange={(event) => setForm((s) => ({ ...s, priceSolo: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input
                type="number"
                value={form.capacity}
                onChange={(event) => setForm((s) => ({ ...s, capacity: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Time slot increment (minutes)</Label>
              <Input
                type="number"
                min={30}
                step={30}
                value={form.timeSlotIncrement}
                onChange={(event) => setForm((s) => ({ ...s, timeSlotIncrement: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                How long each bookable time block is. Minimum 30 minutes. This controls how slots appear on the
                booking calendar.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Typical session length (min)</Label>
              <Input
                type="number"
                min={1}
                value={form.serviceDurationMin}
                onChange={(event) => setForm((s) => ({ ...s, serviceDurationMin: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Typical session length (max)</Label>
              <Input
                type="number"
                min={1}
                value={form.serviceDurationMax}
                onChange={(event) => setForm((s) => ({ ...s, serviceDurationMax: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Service duration unit</Label>
              <Select
                value={form.serviceDurationUnit}
                onValueChange={(value) => setForm((s) => ({ ...s, serviceDurationUnit: value as "minutes" | "hours" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Informational only. This is shown to guests and does not affect scheduling.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Cancellation policy</Label>
              <div className="space-y-2">
                {(["flexible", "moderate", "strict"] as const).map((policyKey) => {
                  const policy = CANCELLATION_POLICIES[policyKey]
                  const isSelected = form.cancellationPolicy === policyKey
                  return (
                    <button
                      key={policyKey}
                      type="button"
                      onClick={() => setForm((s) => ({ ...s, cancellationPolicy: policyKey }))}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected ? "border-[#C75B3A] ring-2 ring-[#C75B3A33]" : "border-[#E5DDD6] hover:bg-[#FCFAF7]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ backgroundColor: policy.color }}
                          />
                          <span className="text-sm font-semibold">{policy.label}</span>
                        </div>
                        {policyKey === "moderate" ? (
                          <span className="text-xs font-medium text-[#8C5336]">✦ Recommended for most hosts</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Full refund {policy.refundWindow}</p>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-[#6D5E51]">{selectedCancellationPolicy.description}</p>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[#E9DFD3] bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.instantBook}
                onChange={(event) => setForm((s) => ({ ...s, instantBook: event.target.checked }))}
              />
              Instant book
            </label>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm((s) => ({ ...s, description: event.target.value }))}
                rows={6}
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-[#E9DFD3] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium text-[#1A1410]">Access &amp; Entry</h2>
          <p className="text-xs text-[#6A5848]">
            {accessSaveState === "saving"
              ? "Saving..."
              : accessSaveState === "saved"
                ? "Saved ✓"
                : accessSaveState === "error"
                  ? "Unable to save"
                  : ""}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Access method</Label>
          <div className="grid gap-2 md:grid-cols-2">
            {(Object.entries(ACCESS_TYPES) as Array<[AccessTypeKey, (typeof ACCESS_TYPES)[AccessTypeKey]]>).map(
              ([key, value]) => {
                const Icon = ACCESS_ICON_MAP[value.icon as keyof typeof ACCESS_ICON_MAP] ?? KeyRound
                const isSelected = form.accessType === key
                const disabled = "comingSoon" in value && Boolean(value.comingSoon)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => (disabled ? undefined : void handleAccessTypeChange(key))}
                    disabled={disabled}
                    className={`rounded-lg p-3 text-left ${
                      isSelected
                        ? "ring-2 ring-[#8B4513]"
                        : "border border-[#E5DDD6]"
                    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-[#5D4D41]" />
                        <p className="text-sm font-semibold text-[#1A1410]">{value.label}</p>
                      </div>
                      {"comingSoon" in value && value.comingSoon ? (
                        <span className="rounded-full bg-[#F5EFE9] px-2 py-0.5 text-[11px] text-[#7A6A5D]">
                          Coming soon
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[#7A6A5D]">{value.description}</p>
                  </button>
                )
              }
            )}
          </div>
        </div>

        {accessConfig.supportsCode ? (
          <div className="space-y-2">
            <Label>Default access code</Label>
            <div className="flex items-start gap-2">
              <Input
                value={form.accessCodeTemplate}
                maxLength={20}
                placeholder={accessCodePlaceholder}
                className="font-mono"
                onChange={(event) => {
                  const nextValue = event.target.value.slice(0, 20)
                  setForm((current) => ({ ...current, accessCodeTemplate: nextValue }))
                  if (accessCodeSaveState !== "idle") setAccessCodeSaveState("idle")
                }}
                onBlur={() => void saveAccessCodeTemplate()}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  accessCodeSaveState === "saving" || form.accessCodeTemplate.trim().slice(0, 20) === savedAccessCodeTemplate
                }
                onClick={() => void saveAccessCodeTemplate()}
              >
                {accessCodeSaveState === "saving" ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="text-xs text-[#6A5848]">
              Used for all new bookings on this listing unless overridden.
            </p>
            <p className="text-xs">
              {accessCodeSaveState === "saving" ? (
                <span className="text-[#7A6A5D]">Saving...</span>
              ) : accessCodeSaveState === "saved" ? (
                <span className="text-emerald-700">Saved ✓</span>
              ) : accessCodeSaveState === "error" ? (
                <span className="text-red-600">Failed to save. Try again.</span>
              ) : null}
            </p>
            <p className="text-xs text-[#6A5848]">
              This is your current active code. Guests will receive this automatically based on your send timing
              setting below.
            </p>
          </div>
        ) : null}

        {form.accessType === "code" ? (
          <div className="space-y-2">
            <Label>Code type</Label>
            <div className="space-y-2">
              {([
                { key: "static", label: "Static - same code for every booking" },
                { key: "dynamic", label: "Dynamic - I update the code per booking" },
              ] as const).map((option) => (
                <label key={option.key} className="flex items-center gap-2 text-sm text-[#1A1410]">
                  <input
                    type="radio"
                    name="access-code-type"
                    checked={form.accessCodeType === option.key}
                    onChange={() => void handleAccessCodeTypeChange(option.key)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {form.accessCodeType === "dynamic" ? (
              <div className="rounded-lg border border-[#E5DDD6] bg-[#FCFAF7] p-3 text-sm text-[#6A5848]">
                ℹ You&apos;ll be prompted to set a code for each new booking from your bookings dashboard. The code is
                sent to the guest once you update it.
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Entry instructions</Label>
            <p className="text-xs text-[#7A6A5D]">{form.accessInstructions.length} / 500</p>
          </div>
          <Textarea
            ref={instructionsRef}
            value={form.accessInstructions}
            rows={4}
            maxLength={500}
            placeholder={ACCESS_INSTRUCTION_PLACEHOLDERS[form.accessType]}
            onChange={(event) => {
              const nextValue = event.target.value.slice(0, 500)
              setForm((current) => ({ ...current, accessInstructions: nextValue }))
              setInstructionsCursor(event.target.selectionStart)
            }}
            onClick={(event) => setInstructionsCursor((event.target as HTMLTextAreaElement).selectionStart)}
            onKeyUp={(event) => setInstructionsCursor((event.target as HTMLTextAreaElement).selectionStart)}
            onBlur={() => void saveAccessInstructions()}
          />
          <div className="flex flex-wrap gap-2">
            {INSTRUCTION_VARIABLES.map((item) => (
              <button
                key={item.variable}
                type="button"
                onClick={() => insertVariable(item.variable)}
                className="rounded-full border border-[#E5DDD6] bg-[#FCFAF7] px-2 py-1 text-xs text-[#5D4D41]"
                title={item.description}
              >
                {item.variable}
              </button>
            ))}
          </div>
          {resolvedInstructionPreview ? (
            <p className="text-xs text-[#7A6A5D]">Preview: {resolvedInstructionPreview}</p>
          ) : null}
        </div>

        {accessConfig.supportsAutoSend ? (
          <div className="space-y-2">
            <Label>When to send access details</Label>
            <div className="space-y-2">
              {(Object.entries(CODE_SEND_TIMING) as Array<[CodeSendTimingKey, string]>).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-[#1A1410]">
                  <input
                    type="radio"
                    name="access-send-timing"
                    checked={form.accessCodeSendTiming === key}
                    onChange={() => void handleSendTimingChange(key)}
                  />
                  <span>
                    {label}
                    {key === "24h_before" ? (
                      <span className="ml-2 text-xs font-medium text-[#8C5336]">✦ Recommended</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[#6A5848]">
              Access details include your entry instructions and code. They are sent via email and in-app message to
              the guest.
            </p>
          </div>
        ) : null}

        <div className="rounded-lg border border-[#E5DDD6] bg-[#FAF7F4] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[#1A1410]">
            <span aria-hidden>📋</span>
            <span>House Rules</span>
          </div>
          {usingDefaultHouseRules ? (
            <>
              <p className="mt-1 text-sm text-[#6D5E51]">
                You haven&apos;t set house rules yet. Thrml&apos;s standard community rules will be included in
                guest emails until you add your own.
              </p>
              <a
                href="/dashboard/account#house-rules"
                className="mt-2 inline-block text-sm font-medium text-[#8B4513] underline-offset-2 hover:underline"
              >
                Add house rules →
              </a>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-[#6D5E51]">
                ✓ You have {configuredHouseRuleCount} house rule{configuredHouseRuleCount === 1 ? "" : "s"} set.
                These will be included in the access details email your guests receive.
              </p>
              <a
                href="/dashboard/account#house-rules"
                className="mt-2 inline-block text-sm font-medium text-[#8B4513] underline-offset-2 hover:underline"
              >
                Edit house rules →
              </a>
            </>
          )}
        </div>

        {accessSaveError ? <p className="text-sm text-destructive">{accessSaveError}</p> : null}
      </div>

      <div className="space-y-3 rounded-xl border border-[#E9DFD3] bg-white p-4">
        <h2 className="font-medium text-[#1A1410]">Blackout dates</h2>
        <p className="text-sm text-[#6A5848]">
          Block single dates or ranges so guests cannot book those days.
        </p>

        <div className="rounded-lg border p-2">
          <Calendar
            mode="range"
            selected={
              blackoutStartDate
                ? {
                    from: new Date(`${blackoutStartDate}T00:00:00`),
                    to: new Date(`${(blackoutEndDate || blackoutStartDate)}T00:00:00`),
                  }
                : undefined
            }
            onSelect={(range) => {
              const from = range?.from ? localDateToIso(range.from) : ""
              const to = range?.to ? localDateToIso(range.to) : from
              setBlackoutStartDate(from)
              setBlackoutEndDate(to)
            }}
            modifiers={{
              blackout: (date) => blackoutDateSet.has(localDateToIso(date)),
            }}
            modifiersClassNames={{
              blackout: "bg-zinc-100 text-zinc-500 line-through opacity-75",
            }}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Start date</Label>
            <Input type="date" value={blackoutStartDate} onChange={(event) => setBlackoutStartDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End date (optional)</Label>
            <Input type="date" value={blackoutEndDate} onChange={(event) => setBlackoutEndDate(event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Reason (optional)</Label>
            <Input
              value={blackoutReason}
              onChange={(event) => setBlackoutReason(event.target.value)}
              placeholder="Vacation, maintenance, private event..."
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={addBlackoutDates} disabled={locked || blackoutSaving}>
            {blackoutSaving ? "Blocking..." : "Add blackout"}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Current blocked dates</p>
          {blackoutLoading ? (
            <p className="text-sm text-[#7A6A5D]">Loading blackout dates...</p>
          ) : blackoutDates.length ? (
            <div className="space-y-2">
              {blackoutDates.map((entry) => (
                <div
                  key={entry.blackout_date}
                  className="flex items-center justify-between rounded-lg border border-[#E9DFD3] px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-[#1A1410]">{entry.blackout_date}</p>
                    {entry.reason ? <p className="text-xs text-[#7A6A5D]">{entry.reason}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeBlackoutDate(entry.blackout_date)}
                    disabled={removingDate === entry.blackout_date}
                    aria-label={`Remove blackout date ${entry.blackout_date}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#7A6A5D]">No blackout dates yet.</p>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      {!locked ? (
        <div className="flex flex-wrap gap-2">
          <Button className="btn-primary" onClick={saveChanges} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={createNewVersion}>
            Create new version
          </Button>
        </div>
      ) : null}

      {canPublishReplacement ? (
        <div className="rounded-xl border border-[#E8D6C5] bg-[#FFF8F0] p-4">
          <h2 className="font-medium text-[#1A1410]">Publish & replace original?</h2>
          <p className="mt-1 text-sm text-[#6A5848]">
            Publishing this version will deactivate {originalTitle}. Guests with existing bookings on the original
            listing are not affected.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => publishVersion(true)} disabled={publishing !== null}>
              {publishing === "replace" ? "Publishing..." : "Publish & deactivate original"}
            </Button>
            <Button variant="outline" onClick={() => publishVersion(false)} disabled={publishing !== null}>
              {publishing === "only" ? "Publishing..." : "Publish only (keep original active)"}
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={showDeactivate} onOpenChange={setShowDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {listing.title || "listing"}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6A5848]">
            Your listing will be hidden from search immediately. You can reactivate it at any time.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivate(false)}>
              Cancel
            </Button>
            <Button onClick={deactivateListing} disabled={deactivating}>
              {deactivating ? "Deactivating..." : "Confirm deactivation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
