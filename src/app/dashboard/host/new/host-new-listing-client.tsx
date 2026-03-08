"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import { useForm, type Path } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  AlertCircle,
  Check,
  ImagePlus,
  Loader2,
  MapPin,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  CANCELLATION_POLICIES,
  getCancellationPolicy,
} from "@/lib/constants/cancellation-policies"
import { AMENITIES_BY_SERVICE_TYPE } from "@/lib/constants/amenities"
import { SERVICE_TYPES } from "@/lib/constants/service-types"
import { createClient } from "@/lib/supabase/client"
import { getPricePerPerson } from "@/lib/pricing"
import type { ServiceTypeId } from "@/lib/service-types"

const saunaTypes = ["Finnish", "Infrared", "Steam", "Barrel", "Wood-Fired"] as const
const cancellationPolicies = ["flexible", "moderate", "strict"] as const
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

const serviceTypeOptions = SERVICE_TYPES.map((serviceType) => ({
  id: serviceType.value,
  display_name: serviceType.label,
  icon: serviceType.emoji,
  tagline: serviceType.description,
}))
const FIXED_SESSION_SERVICES = new Set(["cold_plunge", "infrared", "float_tank", "pemf", "halotherapy", "hyperbaric"])

const serviceAttributeFieldConfig: Record<
  string,
  { key: string; label: string; type?: "text" | "number"; placeholder?: string }[]
> = {
  sauna: [
    { key: "sauna_type", label: "Sauna type", type: "text", placeholder: "Traditional, Barrel, Infrared..." },
    { key: "max_temp", label: "Max temp (F)", type: "number" },
    { key: "capacity", label: "Capacity", type: "number" },
  ],
  cold_plunge: [
    { key: "min_temp", label: "Min temp (F)", type: "number" },
    { key: "chiller_type", label: "Chiller type", type: "text" },
    { key: "vessel", label: "Tub material / vessel", type: "text" },
  ],
  hot_tub: [
    { key: "capacity", label: "Capacity", type: "number" },
    { key: "temperature", label: "Temperature (F)", type: "number" },
    { key: "jets", label: "Jets", type: "text", placeholder: "Hydro, air, mixed..." },
    { key: "cover_included", label: "Cover included", type: "text", placeholder: "Yes/No" },
  ],
  float_tank: [
    { key: "vessel_type", label: "Vessel type", type: "text", placeholder: "Pod or Pool" },
    { key: "salt_type", label: "Salt type", type: "text" },
    { key: "sensory_options", label: "Sensory options", type: "text", placeholder: "Music, lights, silence" },
  ],
}

function bookingModelForService(serviceType: string) {
  if (FIXED_SESSION_SERVICES.has(serviceType)) return "fixed_session"
  return "hourly"
}

const availabilitySchema = z
  .object({
    day: z.string(),
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && value.start >= value.end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be later than start time.",
        path: ["end"],
      })
    }
  })

const listingFormSchema = z
  .object({
    serviceType: z.string(),
    title: z.string().min(6, "Title must be at least 6 characters."),
    saunaType: z.enum(saunaTypes),
    capacity: z.coerce.number().int().min(1).max(20),
    minDurationMinutes: z.coerce.number().int().min(30).max(480),
    serviceDurationMinHours: z.coerce.number().int().min(0).max(24).optional(),
    serviceDurationMinMinutes: z.coerce.number().int().min(0).max(59).optional(),
    serviceDurationMaxHours: z.coerce.number().int().min(0).max(24).optional(),
    serviceDurationMaxMinutes: z.coerce.number().int().min(0).max(59).optional(),
    maxTemperature: z.coerce.number().int().min(80).max(250),
    description: z.string().min(100, "Description must be at least 100 characters."),
    amenities: z.array(z.string()).min(1, "Select at least one amenity."),
    address: z.string().min(5, "Address is required."),
    lat: z.number(),
    lng: z.number(),
    availability: z.array(availabilitySchema),
    priceSolo: z.coerce.number().positive("Solo price must be greater than 0."),
    priceSession: z.coerce.number().optional(),
    enableGroupTiers: z.boolean(),
    price2: z.coerce.number().optional(),
    price3: z.coerce.number().optional(),
    price4plus: z.coerce.number().optional(),
    offerBundle: z.boolean(),
    selectedServices: z.array(z.string()).optional(),
    bundleName: z.string().optional(),
    comboPrice: z.coerce.number().optional(),
    serviceAttributes: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    instantBook: z.boolean(),
    cancellationPolicy: z.enum(cancellationPolicies),
  })
  .superRefine((value, ctx) => {
    const enabledDays = value.availability.filter((day) => day.enabled).length
    if (enabledDays === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enable at least one day of availability.",
        path: ["availability"],
      })
    }

    const bookingModel = bookingModelForService(value.serviceType)

    if (bookingModel === "hourly" && value.enableGroupTiers) {
      if (!value.price2 || value.price2 < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid price for 2 guests.",
          path: ["price2"],
        })
      }
      if (!value.price3 || value.price3 < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid price for 3 guests.",
          path: ["price3"],
        })
      }
      if (!value.price4plus || value.price4plus < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid price for 4+ guests.",
          path: ["price4plus"],
        })
      }

      if (value.price2 && value.price2 > value.priceSolo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group price can't exceed solo price.",
          path: ["price2"],
        })
      }
      if (value.price2 && value.price3 && value.price3 > value.price2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group price can't exceed solo price.",
          path: ["price3"],
        })
      }
      if (value.price3 && value.price4plus && value.price4plus > value.price3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group price can't exceed solo price.",
          path: ["price4plus"],
        })
      }
    }

    if (bookingModel === "fixed_session" && (!value.priceSession || value.priceSession <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid price per session.",
        path: ["priceSession"],
      })
    }
    if (value.minDurationMinutes % 30 !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Time slot increment must use 30-minute increments.",
        path: ["minDurationMinutes"],
      })
    }
    const minServiceDuration =
      Number(value.serviceDurationMinHours ?? 0) * 60 + Number(value.serviceDurationMinMinutes ?? 0)
    const maxServiceDuration =
      Number(value.serviceDurationMaxHours ?? 0) * 60 + Number(value.serviceDurationMaxMinutes ?? 0)
    const hasAnyServiceDuration = minServiceDuration > 0 || maxServiceDuration > 0
    if (hasAnyServiceDuration && (minServiceDuration <= 0 || maxServiceDuration <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set both min and max typical session length.",
        path: ["serviceDurationMaxMinutes"],
      })
    }
    if (hasAnyServiceDuration && maxServiceDuration < minServiceDuration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum session length must be greater than or equal to minimum.",
        path: ["serviceDurationMaxMinutes"],
      })
    }

    if (value.offerBundle) {
      const selected = value.selectedServices ?? []
      if (selected.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select at least 2 services to create a bundle",
          path: ["selectedServices"],
        })
      }
    }
  })

type ListingFormInput = z.input<typeof listingFormSchema>
type ListingFormValues = z.output<typeof listingFormSchema>

type PhotoItem = {
  id: string
  file: File
  preview: string
}

type GeocodeSuggestion = {
  id: string
  place_name: string
  center: [number, number]
}

const STEP_FIELDS: Record<number, Path<ListingFormInput>[]> = {
  1: ["serviceType"],
  2: [
    "title",
    "saunaType",
    "capacity",
    "minDurationMinutes",
    "serviceDurationMinHours",
    "serviceDurationMinMinutes",
    "serviceDurationMaxHours",
    "serviceDurationMaxMinutes",
    "maxTemperature",
    "description",
  ],
  3: [
    "priceSolo",
    "priceSession",
    "enableGroupTiers",
    "price2",
    "price3",
    "price4plus",
    "offerBundle",
    "selectedServices",
    "bundleName",
    "comboPrice",
    "serviceAttributes",
    "instantBook",
    "cancellationPolicy",
  ],
  4: ["amenities"],
  5: ["address", "lat", "lng", "availability"],
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

const TOTAL_STEPS = 5
const REQUIRED_LISTING_COLUMNS = new Set([
  "title",
  "service_type",
  "lat",
  "lng",
  "availability",
  "price_solo",
])

function ProgressBar({ step, totalSteps }: { step: number; totalSteps: number }) {
  const progress = (step / totalSteps) * 100
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Step {step} of {totalSteps}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-brand-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export function HostNewListingClient({
  userId,
  stripeConnected: initialStripeConnected,
  hasStripeAccount: initialHasStripeAccount,
  defaultHouseRules,
}: {
  userId: string
  stripeConnected: boolean
  hasStripeAccount: boolean
  defaultHouseRules: string[]
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null)
  const [mapSuggestions, setMapSuggestions] = useState<GeocodeSuggestion[]>([])
  const [mapLoading, setMapLoading] = useState(false)
  const [isConnectingStripe, setIsConnectingStripe] = useState(false)
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const [stripeConnected, setStripeConnected] = useState(initialStripeConnected)
  const [hasStripeAccount, setHasStripeAccount] = useState(initialHasStripeAccount)
  const [showMoreAmenities, setShowMoreAmenities] = useState(false)
  const allowNavigationRef = useRef(false)

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ListingFormInput, unknown, ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: {
      title: "",
      serviceType: "sauna",
      saunaType: "Finnish",
      capacity: 4,
      minDurationMinutes: 60,
      serviceDurationMinHours: 0,
      serviceDurationMinMinutes: 0,
      serviceDurationMaxHours: 0,
      serviceDurationMaxMinutes: 0,
      maxTemperature: 180,
      description: "",
      amenities: [],
      address: "",
      lat: 0,
      lng: 0,
      availability: weekDays.map((day, index) => ({
        day,
        enabled: index < 5,
        start: "08:00",
        end: "20:00",
      })),
      priceSolo: 35,
      priceSession: 35,
      enableGroupTiers: false,
      price2: undefined,
      price3: undefined,
      price4plus: undefined,
      offerBundle: false,
      selectedServices: ["sauna"],
      bundleName: "",
      comboPrice: undefined,
      serviceAttributes: {},
      instantBook: true,
      cancellationPolicy: "moderate",
    },
  })

  const descriptionLength = watch("description").length
  const selectedAmenities = watch("amenities")
  const address = watch("address")
  const lat = watch("lat")
  const lng = watch("lng")
  const availability = watch("availability")
  const enableGroupTiers = watch("enableGroupTiers")
  const serviceType = watch("serviceType")
  const bookingModel = bookingModelForService(serviceType)

  const priceSolo = watch("priceSolo")
  const priceSession = watch("priceSession")
  const price2 = watch("price2")
  const price3 = watch("price3")
  const price4plus = watch("price4plus")
  const capacity = watch("capacity")
  const cancellationPolicy = watch("cancellationPolicy")
  const serviceDurationMinHours = Number(watch("serviceDurationMinHours") ?? 0)
  const serviceDurationMinMinutes = Number(watch("serviceDurationMinMinutes") ?? 0)
  const serviceDurationMaxHours = Number(watch("serviceDurationMaxHours") ?? 0)
  const serviceDurationMaxMinutes = Number(watch("serviceDurationMaxMinutes") ?? 0)
  const price2Value = typeof price2 === "number" ? price2 : undefined
  const price3Value = typeof price3 === "number" ? price3 : undefined
  const price4plusValue = typeof price4plus === "number" ? price4plus : undefined

  const amenityOptions = useMemo(
    () => AMENITIES_BY_SERVICE_TYPE[serviceType] ?? AMENITIES_BY_SERVICE_TYPE.general,
    [serviceType]
  )
  const commonAmenities = amenityOptions.slice(0, 5)
  const additionalAmenities = amenityOptions.slice(5)
  const canBuildGroupPricing = bookingModel !== "fixed_session" && Number(capacity ?? 1) > 1
  const hasPendingDraft = (isDirty || photos.length > 0 || step > 1) && !allowNavigationRef.current

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setPhotoError(null)
    setPhotos((current) => {
      const newItems = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      }))
      return [...current, ...newItems].slice(0, 12)
    })
  }, [])

  const dropzone = useDropzone({
    onDrop,
    accept: {
      "image/*": [],
    },
    maxFiles: 12,
  })

  useEffect(() => {
    if (address.trim().length < 3) {
      setMapSuggestions([])
      return
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setMapLoading(true)
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            address
          )}.json?autocomplete=true&limit=5&access_token=${token}`,
          { signal: controller.signal }
        )

        if (!response.ok) return
        const data = (await response.json()) as { features?: GeocodeSuggestion[] }
        setMapSuggestions(data.features ?? [])
      } catch {
        setMapSuggestions([])
      } finally {
        setMapLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [address])

  useEffect(() => {
    let cancelled = false
    const refreshConnectStatus = async () => {
      try {
        const response = await fetch("/api/stripe/connect", { method: "GET" })
        const data = (await response.json()) as {
          connected?: boolean
          stripeAccountId?: string | null
          error?: string
        }

        if (!response.ok || cancelled) return
        setStripeConnected(Boolean(data.connected))
        setHasStripeAccount(Boolean(data.stripeAccountId))
      } catch {
        // Keep current state when refresh fails.
      }
    }

    void refreshConnectStatus()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasPendingDraft) return
    const message = "You have an unfinished listing. Leave without completing it?"

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
      return message
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (allowNavigationRef.current) return
      const target = event.target as HTMLElement | null
      const anchor = target?.closest("a")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
      if (anchor.target === "_blank") return

      const confirmLeave = window.confirm(message)
      if (!confirmLeave) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        allowNavigationRef.current = true
      }
    }

    const onPopState = () => {
      if (allowNavigationRef.current) return
      const confirmLeave = window.confirm(message)
      if (!confirmLeave) {
        window.history.pushState(null, "", window.location.href)
      } else {
        allowNavigationRef.current = true
      }
    }

    window.history.pushState(null, "", window.location.href)
    window.addEventListener("beforeunload", beforeUnload)
    document.addEventListener("click", onDocumentClick, true)
    window.addEventListener("popstate", onPopState)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      document.removeEventListener("click", onDocumentClick, true)
      window.removeEventListener("popstate", onPopState)
    }
  }, [hasPendingDraft])

  useEffect(() => {
    if (!enableGroupTiers || !canBuildGroupPricing) return
    const solo = Math.max(5, Number(priceSolo || 0))
    if (!price2) setValue("price2", Math.max(5, Math.round(solo * 0.8)), { shouldValidate: true })
    if (!price3) setValue("price3", Math.max(5, Math.round(solo * 0.7)), { shouldValidate: true })
    if (!price4plus) setValue("price4plus", Math.max(5, Math.round(solo * 0.6)), { shouldValidate: true })
  }, [canBuildGroupPricing, enableGroupTiers, price2, price3, price4plus, priceSolo, setValue])

  useEffect(() => {
    setShowMoreAmenities(false)
  }, [serviceType])

  useEffect(() => {
    const validAmenities = new Set(amenityOptions)
    const filtered = selectedAmenities.filter((amenity) => validAmenities.has(amenity))
    if (filtered.length !== selectedAmenities.length) {
      setValue("amenities", filtered, { shouldValidate: true })
    }
  }, [amenityOptions, selectedAmenities, setValue])

  const pricingPreview = useMemo(() => {
    if (bookingModel === "fixed_session") {
      return [
        {
          guestCount: 1,
          perPerson: Number(priceSession || 0),
        },
      ]
    }

    const tiers = {
      price_solo: Number(priceSolo || 0),
      price_2: enableGroupTiers ? Number(price2 || 0) : undefined,
      price_3: enableGroupTiers ? Number(price3 || 0) : undefined,
      price_4plus: enableGroupTiers ? Number(price4plus || 0) : undefined,
    }
    return [1, 2, 3, 4].map((guestCount) => ({
      guestCount,
      perPerson: getPricePerPerson(tiers, guestCount),
    }))
  }, [bookingModel, enableGroupTiers, price2, price3, price4plus, priceSession, priceSolo])

  async function handleNextStep() {
    setPhotoError(null)
    if (step === 4 && photos.length < 3) {
      setPhotoError("Please upload at least 3 photos.")
      return
    }

    const valid = await trigger(STEP_FIELDS[step])
    if (!valid) return

    setStep((current) => Math.min(TOTAL_STEPS, current + 1))
  }

  function handlePreviousStep() {
    setStep((current) => Math.max(1, current - 1))
  }

  function toggleAmenity(amenityId: string) {
    const next = selectedAmenities.includes(amenityId)
      ? selectedAmenities.filter((value) => value !== amenityId)
      : [...selectedAmenities, amenityId]

    setValue("amenities", next, { shouldValidate: true })
  }

  function tierSavingsLabel(groupPrice: number | undefined, base: number) {
    if (!groupPrice || base <= 0) return null
    const pct = Math.max(0, Math.round((1 - groupPrice / base) * 100))
    return `Save ${pct}%`
  }

  function formatHoursMinutes(hours: number, minutes: number) {
    const safeHours = Math.max(0, Math.floor(hours))
    const safeMinutes = Math.max(0, Math.min(59, Math.floor(minutes)))
    if (safeHours === 0) return `${safeMinutes} min`
    if (safeMinutes === 0) return `${safeHours}hr`
    return `${safeHours}hr ${safeMinutes} min`
  }

  const serviceDurationPreview = useMemo(() => {
    const minTotal = serviceDurationMinHours * 60 + serviceDurationMinMinutes
    const maxTotal = serviceDurationMaxHours * 60 + serviceDurationMaxMinutes
    if (minTotal <= 0 || maxTotal <= 0) return null
    if (minTotal === maxTotal) {
      return `${formatHoursMinutes(serviceDurationMinHours, serviceDurationMinMinutes)} sessions`
    }
    return `${formatHoursMinutes(serviceDurationMinHours, serviceDurationMinMinutes)}—${formatHoursMinutes(serviceDurationMaxHours, serviceDurationMaxMinutes)} sessions`
  }, [
    serviceDurationMaxHours,
    serviceDurationMaxMinutes,
    serviceDurationMinHours,
    serviceDurationMinMinutes,
  ])

  const selectedCancellationPolicy = getCancellationPolicy(cancellationPolicy)

  function reorderPhotos(sourceId: string, targetId: string) {
    setPhotos((current) => {
      const from = current.findIndex((item) => item.id === sourceId)
      const to = current.findIndex((item) => item.id === targetId)
      if (from === -1 || to === -1 || from === to) return current

      const cloned = [...current]
      const [moved] = cloned.splice(from, 1)
      cloned.splice(to, 0, moved)
      return cloned
    })
  }

  function removePhoto(photoId: string) {
    setPhotos((current) => {
      const found = current.find((photo) => photo.id === photoId)
      if (found) URL.revokeObjectURL(found.preview)
      return current.filter((photo) => photo.id !== photoId)
    })
  }

  async function onSubmit(values: ListingFormValues) {
    setPhotoError(null)
    if (photos.length < 3) {
      setPhotoError("Please upload at least 3 photos.")
      setStep(4)
      return
    }

    const supabase = createClient()

    const serviceDurationMinTotal =
      Number(values.serviceDurationMinHours ?? 0) * 60 + Number(values.serviceDurationMinMinutes ?? 0)
    const serviceDurationMaxTotal =
      Number(values.serviceDurationMaxHours ?? 0) * 60 + Number(values.serviceDurationMaxMinutes ?? 0)
    const hasServiceDuration = serviceDurationMinTotal > 0 && serviceDurationMaxTotal > 0

    const listingPayload: Record<string, unknown> = {
      host_id: userId,
      title: values.title,
      service_type: values.serviceType,
      sauna_type: values.saunaType,
      capacity: values.capacity,
      min_duration_override_minutes: Math.max(30, values.minDurationMinutes),
      fixed_session_minutes:
        bookingModelForService(values.serviceType) === "fixed_session"
          ? Math.max(30, values.minDurationMinutes)
          : null,
      max_duration_override_minutes:
        bookingModelForService(values.serviceType) === "fixed_session"
          ? Math.max(30, values.minDurationMinutes)
          : null,
      service_duration_min: hasServiceDuration ? serviceDurationMinTotal : null,
      service_duration_max: hasServiceDuration ? serviceDurationMaxTotal : null,
      service_duration_unit: "minutes",
      max_temp: values.maxTemperature,
      max_temperature: values.maxTemperature,
      description: values.description,
      amenities: values.amenities,
      location_address: values.address,
      location: values.address,
      lat: values.lat,
      lng: values.lng,
      availability: values.availability,
      price_solo:
        bookingModelForService(values.serviceType) === "fixed_session"
          ? values.priceSession ?? values.priceSolo
          : values.priceSolo,
      price_2:
        bookingModelForService(values.serviceType) === "hourly" && values.enableGroupTiers
          ? values.price2
          : null,
      price_3:
        bookingModelForService(values.serviceType) === "hourly" && values.enableGroupTiers
          ? values.price3
          : null,
      price_4plus:
        bookingModelForService(values.serviceType) === "hourly" && values.enableGroupTiers
          ? values.price4plus
          : null,
      service_attributes: values.serviceAttributes ?? {},
      instant_book: values.instantBook,
      is_instant_book: values.instantBook,
      cancellation_policy: values.cancellationPolicy,
      house_rules: defaultHouseRules,
      is_active: true,
    }

    let listing: { id: string } | null = null
    let listingErrorMessage: string | null = null

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { data, error } = await supabase
        .from("listings")
        .insert(listingPayload)
        .select("id")
        .single()

      if (!error && data) {
        listing = data
        break
      }

      const message = error?.message ?? "Failed to create listing."
      listingErrorMessage = message
      const missingColumnMatch = message.match(/'([^']+)' column of 'listings'/i)
      const missingColumn = missingColumnMatch?.[1]

      if (!missingColumn || !(missingColumn in listingPayload)) {
        break
      }

      if (REQUIRED_LISTING_COLUMNS.has(missingColumn)) {
        listingErrorMessage = `Database schema is missing required column "${missingColumn}". Run the latest listings migration before publishing.`
        break
      }

      delete listingPayload[missingColumn]
    }

    if (!listing) {
      setPhotoError(listingErrorMessage ?? "Failed to create listing.")
      return
    }

    const photoRows: { listing_id: string; url: string; order_index: number }[] = []

    for (const [index, photo] of photos.entries()) {
      const ext = photo.file.name.split(".").pop() || "jpg"
      const filePath = `${userId}/${listing.id}/${Date.now()}-${index}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("listing-photos")
        .upload(filePath, photo.file, { upsert: false })

      if (uploadError) {
        setPhotoError(uploadError.message)
        return
      }

      const { data: publicData } = supabase.storage.from("listing-photos").getPublicUrl(filePath)
      photoRows.push({
        listing_id: listing.id,
        url: publicData.publicUrl,
        order_index: index,
      })
    }

    const { error: photosError } = await supabase.from("listing_photos").insert(photoRows)
    if (photosError) {
      setPhotoError(photosError.message)
      return
    }

    allowNavigationRef.current = true
    router.push(`/listing/${listing.id}`)
  }

  async function handleSetupPayouts() {
    setOnboardingError(null)
    setIsConnectingStripe(true)

    try {
      const response = await fetch("/api/stripe/connect", { method: "POST" })
      const data = (await response.json()) as { onboardingUrl?: string; error?: string }
      if (!response.ok || !data.onboardingUrl) {
        throw new Error(data.error ?? "Unable to start Stripe onboarding.")
      }
      allowNavigationRef.current = true
      window.location.href = data.onboardingUrl
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : "Unable to start Stripe onboarding.")
      setIsConnectingStripe(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <Card className="card-base gap-4">
        <CardHeader className="space-y-3">
          <CardTitle className="type-h2">Create your Thrml listing</CardTitle>
          <ProgressBar step={step} totalSteps={TOTAL_STEPS} />
        </CardHeader>

        <CardContent>
          {!stripeConnected ? (
            <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 text-amber-700" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-900">Set up payouts when you are ready to earn</p>
                    <p className="text-xs text-amber-800">
                      {hasStripeAccount
                        ? "Finish Stripe onboarding so payouts can start after your first booking."
                        : "Connect Stripe now or do it later from Account settings."}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="btn-primary"
                  onClick={handleSetupPayouts}
                  disabled={isConnectingStripe}
                >
                  {isConnectingStripe ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    "Set up payouts"
                  )}
                </Button>
              </div>
              {onboardingError ? <p className="mt-2 text-sm text-destructive">{onboardingError}</p> : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="transition-all duration-200">
              {step === 1 ? (
                <div className="space-y-5">
                  <h2 className="type-h2">Step 1 — Select service type</h2>
                  <div className="space-y-2">
                    <Label>Service type</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {serviceTypeOptions.map((serviceOption) => (
                        <button
                          key={serviceOption.id}
                          type="button"
                          onClick={() =>
                            setValue("serviceType", serviceOption.id as ServiceTypeId, {
                              shouldValidate: true,
                            })
                          }
                          className={`rounded-lg border p-3 text-left ${
                            serviceType === serviceOption.id
                              ? "border-brand-500 bg-brand-100"
                              : "bg-white hover:bg-muted"
                          }`}
                        >
                          <p className="font-medium">
                            <span className="mr-1">{serviceOption.icon}</span>
                            {serviceOption.display_name}
                          </p>
                          <p className="type-label">{serviceOption.tagline}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  <h2 className="type-h2">Step 2 — Service details</h2>
                  <div className="space-y-2">
                    <Label htmlFor="title">Listing title</Label>
                    <Input id="title" {...register("title")} />
                    {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="capacity">Capacity (1-20)</Label>
                      <Input id="capacity" type="number" min={1} max={20} {...register("capacity")} />
                      {errors.capacity ? (
                        <p className="text-sm text-destructive">{errors.capacity.message}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">This sets the max guests per booking.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="min-duration">Time slot increment</Label>
                      <Input
                        id="min-duration"
                        type="number"
                        min={30}
                        max={480}
                        step={30}
                        {...register("minDurationMinutes")}
                      />
                      {errors.minDurationMinutes ? (
                        <p className="text-sm text-destructive">{errors.minDurationMinutes.message}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        How long each bookable time block is. Minimum 30 minutes. This controls how slots appear on
                        the booking calendar.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-[#E5E0D8] p-3">
                    <Label>Typical session length</Label>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Minimum</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={24}
                              placeholder="Hours"
                              className="pr-10"
                              {...register("serviceDurationMinHours")}
                            />
                            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">hr</span>
                          </div>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              placeholder="Minutes"
                              className="pr-10"
                              {...register("serviceDurationMinMinutes")}
                            />
                            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-center text-xl text-[#B8B1A9] md:pt-6" aria-hidden="true">
                        —
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Maximum</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={24}
                              placeholder="Hours"
                              className="pr-10"
                              {...register("serviceDurationMaxHours")}
                            />
                            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">hr</span>
                          </div>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              placeholder="Minutes"
                              className="pr-10"
                              {...register("serviceDurationMaxMinutes")}
                            />
                            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">min</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {errors.serviceDurationMaxMinutes ? (
                      <p className="text-sm text-destructive">{errors.serviceDurationMaxMinutes.message}</p>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Typical session length: how long guests typically spend on the experience. This is shown to guests
                    on your listing page and does not affect scheduling.
                  </p>
                  {serviceDurationPreview ? (
                    <p className="text-xs text-muted-foreground">Preview: {serviceDurationPreview}</p>
                  ) : null}

                  {serviceType === "sauna" ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-1">
                        <div className="space-y-2">
                          <Label>Sauna type</Label>
                          <Select
                            value={watch("saunaType")}
                            onValueChange={(value) =>
                              setValue("saunaType", value as ListingFormValues["saunaType"], {
                                shouldValidate: true,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {saunaTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max-temperature">Max temperature (F)</Label>
                        <Input id="max-temperature" type="number" {...register("maxTemperature")} />
                        {errors.maxTemperature ? (
                          <p className="text-sm text-destructive">{errors.maxTemperature.message}</p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {(serviceAttributeFieldConfig[serviceType] ?? []).map((field) => (
                        <div className="space-y-2" key={field.key}>
                          <Label>{field.label}</Label>
                          <Input
                            type={field.type ?? "text"}
                            placeholder={field.placeholder}
                            value={String(watch(`serviceAttributes.${field.key}` as Path<ListingFormInput>) ?? "")}
                            onChange={(event) =>
                              setValue(
                                `serviceAttributes.${field.key}` as Path<ListingFormInput>,
                                field.type === "number"
                                  ? Number(event.target.value)
                                  : event.target.value,
                                { shouldValidate: true }
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" rows={6} {...register("description")} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{descriptionLength}/100 min characters</span>
                      {errors.description ? (
                        <span className="text-destructive">{errors.description.message}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="space-y-5">
                  <h2 className="type-h2">Step 4 — Photos & amenities</h2>
                  <div className="space-y-3">
                    <Label>Photos (minimum 3)</Label>
                    <div
                      {...dropzone.getRootProps()}
                      className="cursor-pointer rounded-lg border border-dashed p-8 text-center hover:bg-muted/40"
                    >
                      <input {...dropzone.getInputProps()} />
                      <ImagePlus className="mx-auto mb-2 size-6 text-muted-foreground" />
                      <p className="text-sm">Drag photos here or click to browse</p>
                      <p className="mt-1 text-xs text-muted-foreground">Up to 12 photos</p>
                    </div>

                    {photos.length ? (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {photos.map((photo) => (
                          <div
                            key={photo.id}
                            draggable
                            onDragStart={() => setDraggingPhotoId(photo.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              if (!draggingPhotoId) return
                              reorderPhotos(draggingPhotoId, photo.id)
                              setDraggingPhotoId(null)
                            }}
                            className="space-y-2 rounded-lg border p-2"
                          >
                            <img src={photo.preview} alt="Listing upload" className="h-24 w-full rounded object-cover" />
                            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => removePhoto(photo.id)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Amenities</Label>
                    <p className="text-xs text-muted-foreground">
                      Tailored for {serviceTypeOptions.find((item) => item.id === serviceType)?.display_name ?? "this service"}.
                    </p>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Common</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {commonAmenities.map((amenity) => {
                        const isSelected = selectedAmenities.includes(amenity)
                        return (
                          <button
                            key={amenity}
                            type="button"
                            onClick={() => toggleAmenity(amenity)}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              isSelected ? "border-brand-500 bg-brand-100" : "border-[#E5E0D8] bg-white text-muted-foreground"
                            }`}
                          >
                            <span className="min-w-0 flex-1">{amenity}</span>
                            {isSelected ? <Check className="size-4 text-brand-500" /> : null}
                          </button>
                        )
                      })}
                    </div>
                    {additionalAmenities.length ? (
                      <div className="space-y-2 pt-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-600"
                          onClick={() => setShowMoreAmenities((value) => !value)}
                        >
                          {showMoreAmenities ? "Hide additional amenities -" : "Show more amenities +"}
                        </button>
                        {showMoreAmenities ? (
                          <>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Additional
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {additionalAmenities.map((amenity) => {
                                const isSelected = selectedAmenities.includes(amenity)
                                return (
                                  <button
                                    key={amenity}
                                    type="button"
                                    onClick={() => toggleAmenity(amenity)}
                                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                      isSelected
                                        ? "border-brand-500 bg-brand-100"
                                        : "border-[#E5E0D8] bg-white text-muted-foreground"
                                    }`}
                                  >
                                    <span className="min-w-0 flex-1">{amenity}</span>
                                    {isSelected ? <Check className="size-4 text-brand-500" /> : null}
                                  </button>
                                )
                              })}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {errors.amenities ? (
                      <p className="text-sm text-destructive">{errors.amenities.message}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {step === 5 ? (
                <div className="space-y-5">
                  <h2 className="type-h2">Step 5 — Location & availability</h2>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      {...register("address")}
                      placeholder="Start typing address..."
                    />

                    {mapLoading ? <p className="text-xs text-muted-foreground">Searching...</p> : null}
                    {mapSuggestions.length ? (
                      <div className="rounded-md border">
                        {mapSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setValue("address", suggestion.place_name, { shouldValidate: true })
                              setValue("lng", suggestion.center[0], { shouldValidate: true })
                              setValue("lat", suggestion.center[1], { shouldValidate: true })
                              setMapSuggestions([])
                            }}
                          >
                            <MapPin className="mt-0.5 size-4 shrink-0" />
                            <span>{suggestion.place_name}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {errors.address ? (
                      <p className="text-sm text-destructive">{errors.address.message}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Map preview</Label>
                    {lat !== 0 && lng !== 0 && process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
                      <img
                        src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+f97316(${lng},${lat})/${lng},${lat},13,0/900x340?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`}
                        alt="Location preview map"
                        className="h-52 w-full rounded-lg border object-cover"
                      />
                    ) : (
                      <div className="flex h-52 items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
                        Select an address to preview map location
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>Weekly availability</Label>
                    <div className="space-y-2">
                      {availability.map((day, index) => (
                        <div key={day.day} className="grid grid-cols-[100px_1fr] items-center gap-3 rounded-lg border p-3 md:grid-cols-[120px_1fr_1fr_1fr]">
                          <button
                            type="button"
                            className={`rounded-md px-2 py-1 text-sm ${
                              day.enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"
                            }`}
                            onClick={() =>
                              setValue(`availability.${index}.enabled`, !day.enabled, {
                                shouldValidate: true,
                              })
                            }
                          >
                            {day.enabled ? "On" : "Off"} {day.day}
                          </button>

                          <Input
                            type="time"
                            disabled={!day.enabled}
                            {...register(`availability.${index}.start`)}
                          />
                          <Input
                            type="time"
                            disabled={!day.enabled}
                            {...register(`availability.${index}.end`)}
                          />
                        </div>
                      ))}
                    </div>
                    {errors.availability ? (
                      <p className="text-sm text-destructive">{errors.availability.message as string}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-5">
                  <h2 className="type-h2">Step 3 — Pricing</h2>
                  {bookingModel === "fixed_session" ? (
                    <div className="space-y-2">
                      <Label htmlFor="price-session">Price per session</Label>
                      <Input id="price-session" type="number" min={1} {...register("priceSession")} />
                      {errors.priceSession ? (
                        <p className="text-sm text-destructive">{errors.priceSession.message}</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="price-solo">Base solo price</Label>
                      <Input id="price-solo" type="number" min={1} {...register("priceSolo")} />
                      {errors.priceSolo ? (
                        <p className="text-sm text-destructive">{errors.priceSolo.message}</p>
                      ) : null}
                    </div>
                  )}

                  {canBuildGroupPricing ? (
                    <div className="space-y-4 rounded-xl border border-[#E5E0D8] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Group pricing</p>
                          <p className="text-xs text-muted-foreground">Reward guests who bring friends</p>
                        </div>
                        <Switch
                          checked={enableGroupTiers}
                          onCheckedChange={(checked) =>
                            setValue("enableGroupTiers", checked, { shouldValidate: true })
                          }
                        />
                      </div>

                      {enableGroupTiers ? (
                        <>
                          <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_120px_auto] items-center gap-3 text-sm">
                              <span>Solo (1 person)</span>
                              <Input
                                type="number"
                                min={5}
                                value={Number(priceSolo || 0)}
                                onChange={(event) =>
                                  setValue("priceSolo", Number(event.target.value), { shouldValidate: true })
                                }
                              />
                              <span className="text-muted-foreground">/person</span>
                            </div>
                            <div className="grid grid-cols-[1fr_120px_auto] items-center gap-3 text-sm">
                              <span>2 people</span>
                              <Input
                                id="price-2"
                                type="number"
                                min={5}
                                value={price2Value ?? ""}
                                onChange={(event) =>
                                  setValue("price2", Number(event.target.value), { shouldValidate: true })
                                }
                              />
                              <span className="text-emerald-700 text-xs">
                                {tierSavingsLabel(price2Value, Number(priceSolo || 0))}
                              </span>
                            </div>
                            {errors.price2 ? <p className="text-xs text-destructive">{errors.price2.message}</p> : null}
                            <div className="grid grid-cols-[1fr_120px_auto] items-center gap-3 text-sm">
                              <span>3 people</span>
                              <Input
                                id="price-3"
                                type="number"
                                min={5}
                                value={price3Value ?? ""}
                                onChange={(event) =>
                                  setValue("price3", Number(event.target.value), { shouldValidate: true })
                                }
                              />
                              <span className="text-emerald-700 text-xs">
                                {tierSavingsLabel(price3Value, Number(priceSolo || 0))}
                              </span>
                            </div>
                            {errors.price3 ? <p className="text-xs text-destructive">{errors.price3.message}</p> : null}
                            <div className="grid grid-cols-[1fr_120px_auto] items-center gap-3 text-sm">
                              <span>4+ people</span>
                              <Input
                                id="price-4"
                                type="number"
                                min={5}
                                value={price4plusValue ?? ""}
                                onChange={(event) =>
                                  setValue("price4plus", Number(event.target.value), { shouldValidate: true })
                                }
                              />
                              <span className="text-emerald-700 text-xs">
                                {tierSavingsLabel(price4plusValue, Number(priceSolo || 0))}
                              </span>
                            </div>
                            {errors.price4plus ? (
                              <p className="text-xs text-destructive">{errors.price4plus.message}</p>
                            ) : null}
                          </div>

                          <Card className="border-[#E5E0D8]">
                            <CardContent className="px-0 py-0">
                              <p className="border-b px-4 py-3 text-sm font-medium">
                                How guests will see your pricing:
                              </p>
                              <div className="divide-y">
                                <div className="flex items-center justify-between px-4 py-2 text-sm">
                                  <span className="text-muted-foreground">Solo</span>
                                  <span>${Number(priceSolo || 0).toFixed(0)} / person</span>
                                </div>
                                <div className="flex items-center justify-between bg-muted/40 px-4 py-2 text-sm">
                                  <span className="text-muted-foreground">2 guests</span>
                                  <span>
                                    ${Number(price2 || 0).toFixed(0)} / person ·{" "}
                                    {tierSavingsLabel(price2Value, Number(priceSolo || 0))?.toLowerCase() ?? "save 0%"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2 text-sm">
                                  <span className="text-muted-foreground">3 guests</span>
                                  <span>
                                    ${Number(price3 || 0).toFixed(0)} / person ·{" "}
                                    {tierSavingsLabel(price3Value, Number(priceSolo || 0))?.toLowerCase() ?? "save 0%"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between bg-muted/40 px-4 py-2 text-sm">
                                  <span className="text-muted-foreground">4+ guests</span>
                                  <span>
                                    ${Number(price4plus || 0).toFixed(0)} / person ·{" "}
                                    {tierSavingsLabel(price4plusValue, Number(priceSolo || 0))?.toLowerCase() ?? "save 0%"}
                                  </span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Instant book</Label>
                      <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                        <Switch
                          checked={watch("instantBook")}
                          onCheckedChange={(checked) => setValue("instantBook", checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {watch("instantBook") ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Cancellation policy</Label>
                      <div className="space-y-2">
                        {cancellationPolicies.map((policyKey) => {
                          const policy = CANCELLATION_POLICIES[policyKey]
                          const isSelected = cancellationPolicy === policyKey
                          return (
                            <button
                              key={policyKey}
                              type="button"
                              onClick={() =>
                                setValue("cancellationPolicy", policyKey, {
                                  shouldValidate: true,
                                })
                              }
                              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                                isSelected
                                  ? "border-[#C75B3A] ring-2 ring-[#C75B3A33]"
                                  : "border-[#E5DDD6] hover:bg-[#FCFAF7]"
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
                              <p className="mt-1 text-xs text-muted-foreground">
                                Full refund {policy.refundWindow}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-xs text-[#6D5E51]">{selectedCancellationPolicy.description}</p>
                    </div>
                  </div>

                  <Card className="card-base gap-3 py-4">
                    <CardContent className="space-y-2 px-4">
                      <p className="text-sm font-medium">Live guest pricing preview</p>
                      {pricingPreview.map((row) => (
                        <div key={row.guestCount} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {bookingModel === "fixed_session"
                              ? "Per session"
                              : row.guestCount === 4
                                ? "4+ guests"
                                : `${row.guestCount} guest${row.guestCount > 1 ? "s" : ""}`}
                          </span>
                          <span>
                            {bookingModel === "fixed_session"
                              ? `${formatMoney(row.perPerson)} / session`
                              : `${formatMoney(row.perPerson)} / person / hr`}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </div>

            {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep} disabled={step === 1}>
                Back
              </Button>

              {step < TOTAL_STEPS ? (
                <Button type="button" onClick={handleNextStep}>
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating listing..." : "Publish listing"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
