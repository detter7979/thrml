"use client"

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { CalendarDays, CheckCircle2, CreditCard, UserCheck } from "lucide-react"

import { WaiverModal } from "@/components/booking/WaiverModal"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getCancellationPolicy } from "@/lib/constants/cancellation-policies"
import { LEGAL_VERSIONS } from "@/lib/legal-config"
import { buildFullName, splitFullName } from "@/lib/name-utils"
import { usePlatformFeePercents } from "@/contexts/platform-fees-context"
import { calculateFees } from "@/lib/fees"
import { calculateBookingSubtotal, getPricePerPerson, type PricingTiers } from "@/lib/pricing"

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

interface BookingFlowClientProps {
  listingId: string
  listingTitle: string
  serviceType: string
  listingPhotoUrl: string | null
  pricing: PricingTiers
  initialDate: string
  initialGuestCount: number
  initialDurationHours: number
  initialStartTime: string
  initialEndTime: string
  profileDefaults: {
    fullName: string
    firstName?: string
    lastName?: string
    email: string
    phone: string
  }
  healthDisclaimer?: string | null
  durationConstraints: {
    minMins: number
    maxMins: number
    increment: number
    sessionType: "hourly" | "fixed_session"
  }
  instantBook: boolean
  cancellationPolicy: string | null
}

interface CheckoutPayload {
  listingId: string
  guestCount: number
  sessionDate: string
  startTime: string
  endTime: string
  durationHours: number
  waiver_version: string
  waiverAccepted: boolean
  disclaimersAccepted: boolean
  newsletterOptIn: boolean
  applyReferralCredit: boolean
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatBookingDateTime(sessionDate: string, startTime: string, endTime: string) {
  const date = new Date(`${sessionDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return `${sessionDate} · ${startTime}–${endTime}`
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)
  const start = new Date(`${sessionDate}T${startTime}`).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
  const end = new Date(`${sessionDate}T${endTime}`).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${dateLabel} · ${start}–${end}`
}

function StepPill({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <div
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        isActive ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      {label}
    </div>
  )
}

function PaymentStep({
  payload,
  bookingId,
  acceptedTerms,
  acceptedDisclaimers,
  newsletterChecked,
  onAcceptedTermsChange,
  onAcceptedDisclaimersChange,
  onNewsletterCheckedChange,
  onLegalAccepted,
  instantBook,
  cancellationPolicy,
}: {
  payload: CheckoutPayload
  bookingId: string
  acceptedTerms: boolean
  acceptedDisclaimers: boolean
  newsletterChecked: boolean
  onAcceptedTermsChange: (checked: boolean) => void
  onAcceptedDisclaimersChange: (checked: boolean) => void
  onNewsletterCheckedChange: (checked: boolean) => void
  onLegalAccepted: () => Promise<void>
  instantBook: boolean
  cancellationPolicy: string | null
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [legalError, setLegalError] = useState<string | null>(null)
  const [paymentUiError, setPaymentUiError] = useState<string | null>(null)
  const termsRowRef = useRef<HTMLLabelElement | null>(null)
  const disclaimersRowRef = useRef<HTMLLabelElement | null>(null)
  const policy = getCancellationPolicy(cancellationPolicy)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    console.log("[booking-flow] confirm payment submit", {
      bookingId,
      listingId: payload.listingId,
      newsletterOptIn: payload.newsletterOptIn,
    })
    if (!acceptedTerms || !acceptedDisclaimers) {
      setLegalError("Please accept the terms and disclaimers to continue")
      const shake = (node: HTMLElement | null) => {
        if (!node) return
        node.animate(
          [
            { transform: "translateX(0px)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(0px)" },
          ],
          { duration: 260, easing: "ease-in-out" }
        )
      }
      if (!acceptedTerms) shake(termsRowRef.current)
      if (!acceptedDisclaimers) shake(disclaimersRowRef.current)
      return
    }

    setLegalError(null)
    if (!stripe || !elements) return

    setIsSubmitting(true)
    setError(null)

    await onLegalAccepted()

    console.log("[booking-flow] calling stripe.confirmPayment")
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/confirmation?bookingId=${bookingId}&listingId=${payload.listingId}`,
      },
      redirect: "if_required",
    })
    console.log("[booking-flow] stripe.confirmPayment result", result)

    if (result.error) {
      setError(result.error.message ?? "Payment failed. Please try again.")
      setIsSubmitting(false)
      return
    }

    if (payload.newsletterOptIn) {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsletter_opted_in: true,
          newsletter_opted_in_at: new Date().toISOString(),
          notification_preferences: {
            marketing_wellness_tips: true,
          },
        }),
      })
    }

    router.push(`/book/confirmation?bookingId=${bookingId}&listingId=${payload.listingId}`)
  }

  return (
    <Card className="card-base">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CreditCard className="size-4" />
          <span>Secure payment by Stripe</span>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <PaymentElement
            onLoadError={() => {
              setPaymentUiError(
                "Secure payment UI failed to load. Refresh the page and try again."
              )
            }}
          />
          {paymentUiError ? <p className="text-sm text-destructive">{paymentUiError}</p> : null}
          <div className="mb-4 rounded-lg border border-[#E5DDD6] p-4">
            <div className="mb-2">
              <span className="text-sm font-medium">Cancellation policy</span>
            </div>
            <p className="text-sm text-[#6D5E51]">{policy.description}</p>
          </div>

          <div className="rounded-2xl border-[1.5px] border-[#EDE8E2] bg-white p-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-[#1A1410]">Before you confirm</p>

              <label ref={termsRowRef} className="flex min-h-11 items-start gap-3 rounded-md px-1 py-2">
                <Checkbox checked={acceptedTerms} onCheckedChange={(checked) => onAcceptedTermsChange(Boolean(checked))} />
                <span className="text-[13px] leading-5 text-[#1A1410]">
                  I agree to thrml&apos;s{" "}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                    Terms of Service
                  </Link>{" "}
                  and acknowledge this booking is a direct agreement between me and the space owner.
                  <span className="ml-1 text-destructive">*</span>
                </span>
              </label>

              <label
                ref={disclaimersRowRef}
                className="flex min-h-11 items-start gap-3 rounded-md px-1 py-2"
              >
                <Checkbox
                  checked={acceptedDisclaimers}
                  onCheckedChange={(checked) => onAcceptedDisclaimersChange(Boolean(checked))}
                />
                <span className="text-[13px] leading-5 text-[#1A1410]">
                  I have read and agree to the{" "}
                  <Link href="/disclaimer" target="_blank" rel="noopener noreferrer" className="underline">
                    Disclaimers
                  </Link>
                  .
                  <span className="ml-1 text-destructive">*</span>
                </span>
              </label>

              <label className="flex min-h-11 items-start gap-3 rounded-md px-1 py-2">
                <Checkbox
                  checked={newsletterChecked}
                  onCheckedChange={(checked) => onNewsletterCheckedChange(Boolean(checked))}
                />
                <span className="text-[13px] leading-5 text-[#1A1410]">
                  Send me wellness tips, new spaces in Seattle, and exclusive offers from thrml.
                </span>
              </label>
            </div>
          </div>

          {legalError ? <p className="text-sm text-destructive">{legalError}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="btn-primary w-full" disabled={!stripe || isSubmitting}>
            {isSubmitting ? "Processing..." : instantBook ? "Confirm & Pay" : "Request to book"}
          </Button>
          {!instantBook ? (
            <p className="text-xs text-muted-foreground">
              Your card won&apos;t be charged until the host confirms. Hosts typically respond within a few hours.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

export function BookingFlowClient({
  listingId,
  listingTitle,
  serviceType,
  listingPhotoUrl,
  pricing,
  initialDate,
  initialGuestCount,
  initialDurationHours,
  initialStartTime,
  initialEndTime,
  profileDefaults,
  healthDisclaimer = null,
  durationConstraints,
  instantBook,
  cancellationPolicy,
}: BookingFlowClientProps) {
  const feePercents = usePlatformFeePercents()
  const [step, setStep] = useState(1)
  const [guestDetails, setGuestDetails] = useState(() => {
    const splitName = splitFullName(profileDefaults.fullName)
    const firstName = profileDefaults.firstName ?? splitName.firstName
    const lastName = profileDefaults.lastName ?? splitName.lastName
    return {
      ...profileDefaults,
      firstName,
      lastName,
      fullName: buildFullName(firstName, lastName) || profileDefaults.fullName,
    }
  })
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [isLoadingPayment, setIsLoadingPayment] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedDisclaimers, setAcceptedDisclaimers] = useState(false)
  const [acceptedWaiverVersion, setAcceptedWaiverVersion] = useState<string | null>(null)
  const [waiverModalOpen, setWaiverModalOpen] = useState(false)
  const [newsletterChecked, setNewsletterChecked] = useState(true)
  const [referralWalletCents, setReferralWalletCents] = useState(0)
  const [applyReferralCredit, setApplyReferralCredit] = useState(false)
  const referralStatsLoadedRef = useRef(false)
  const checkoutInitInFlightRef = useRef(false)

  useEffect(() => {
    console.log("[booking-flow] state change", {
      step,
      isLoadingPayment,
      paymentError,
      clientSecretPresent: Boolean(clientSecret),
      bookingId,
    })
  }, [step, isLoadingPayment, paymentError, clientSecret, bookingId])

  const payload: CheckoutPayload = useMemo(
    () => ({
      listingId,
      guestCount: initialGuestCount,
      sessionDate: initialDate,
      startTime: initialStartTime,
      endTime: initialEndTime,
      durationHours: initialDurationHours,
      waiver_version: acceptedWaiverVersion ?? "",
      waiverAccepted: Boolean(acceptedWaiverVersion),
      disclaimersAccepted: acceptedDisclaimers,
      newsletterOptIn: newsletterChecked,
      applyReferralCredit: applyReferralCredit && referralWalletCents > 0,
    }),
    [
      acceptedDisclaimers,
      initialDate,
      initialDurationHours,
      initialEndTime,
      initialGuestCount,
      initialStartTime,
      listingId,
      acceptedWaiverVersion,
      newsletterChecked,
      applyReferralCredit,
      referralWalletCents,
    ]
  )

  const totals = useMemo(() => {
    const sub = calculateBookingSubtotal(
      pricing,
      payload.guestCount,
      durationConstraints.sessionType === "fixed_session" ? 1 : payload.durationHours
    )
    return {
      ...sub,
      ...calculateFees(sub.subtotal, feePercents.guestFeePercent, feePercents.hostFeePercent),
    }
  }, [
    durationConstraints.sessionType,
    feePercents.guestFeePercent,
    feePercents.hostFeePercent,
    payload.durationHours,
    payload.guestCount,
    pricing,
  ])

  const ensureReferralWalletLoaded = useCallback(async () => {
    if (referralStatsLoadedRef.current) return
    const res = await fetch("/api/referral/stats")
    if (!res.ok) return
    referralStatsLoadedRef.current = true
    const j = (await res.json()) as { walletBalanceCents?: number }
    const w = Number(j.walletBalanceCents ?? 0)
    setReferralWalletCents(w)
    setApplyReferralCredit((current) => current || w > 0)
  }, [])

  useEffect(() => {
    if (step >= 2) {
      void ensureReferralWalletLoaded()
    }
  }, [ensureReferralWalletLoaded, step])

  const createCheckoutIntent = useCallback(async (waiverVersionOverride?: string) => {
    if (checkoutInitInFlightRef.current) {
      return
    }

    await ensureReferralWalletLoaded()

    const requestPayload = {
      ...payload,
      waiver_version: waiverVersionOverride ?? payload.waiver_version,
      waiverAccepted: Boolean(waiverVersionOverride ?? payload.waiver_version),
    }
    if (!requestPayload.disclaimersAccepted) {
      setPaymentError("Please accept the Disclaimers to continue.")
      return
    }
    if (!requestPayload.waiver_version.trim()) {
      setPaymentError("Waiver acceptance required")
      return
    }

    console.log("[booking-flow] createCheckoutIntent started", { payload: requestPayload })
    checkoutInitInFlightRef.current = true
    setIsLoadingPayment(true)
    setPaymentError(null)
    let timeoutId: number | undefined

    try {
      const controller = new AbortController()
      timeoutId = window.setTimeout(() => controller.abort(), 20000)
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      })

      const data = (await response.json()) as {
        clientSecret?: string
        bookingId?: string
        error?: string
        details?: {
          fieldErrors?: Record<string, string[] | undefined>
          formErrors?: string[]
        }
      }
      console.log("[booking-flow] checkout API response", {
        ok: response.ok,
        status: response.status,
        data,
      })

      if (!response.ok || !data.clientSecret || !data.bookingId) {
        const fieldErrorText = data.details?.fieldErrors
          ? Object.entries(data.details.fieldErrors)
              .flatMap(([field, messages]) => (messages ?? []).map((message) => `${field}: ${message}`))
              .join(" | ")
          : ""
        const formErrorText = (data.details?.formErrors ?? []).join(" | ")
        const message =
          data.error === "host_payouts_not_configured"
            ? "This host hasn't set up payouts yet. Booking is temporarily unavailable."
            : (data.error ?? "Unable to initialize payment.")
        const detailedMessage = [message, fieldErrorText, formErrorText].filter(Boolean).join(" — ")
        throw new Error(detailedMessage)
      }

      setClientSecret(data.clientSecret)
      setBookingId(data.bookingId)
      console.log("[booking-flow] checkout initialized", {
        bookingId: data.bookingId,
        clientSecret: data.clientSecret,
        clientSecretPresent: Boolean(data.clientSecret),
      })
    } catch (error) {
      console.error("[booking-flow] createCheckoutIntent error", error)
      if (error instanceof DOMException && error.name === "AbortError") {
        setPaymentError("Payment setup timed out. Please try again.")
        return
      }
      setPaymentError(error instanceof Error ? error.message : "Unable to initialize payment.")
    } finally {
      checkoutInitInFlightRef.current = false
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
      setIsLoadingPayment(false)
    }
  }, [ensureReferralWalletLoaded, payload])

  useEffect(() => {
    console.log("[booking-flow] step=3 effect evaluation", {
      step,
      paymentError,
      hasListingId: Boolean(payload.listingId),
      hasStartTime: Boolean(payload.startTime),
      hasEndTime: Boolean(payload.endTime),
      guestCount: payload.guestCount,
      durationHours: payload.durationHours,
      clientSecretPresent: Boolean(clientSecret),
      bookingId,
      isLoadingPayment,
    })
    if (step !== 3) return
    if (paymentError) return
    if (!payload.listingId || !payload.startTime || !payload.endTime) return
    if (!Number.isFinite(payload.guestCount) || payload.guestCount < 1) return
    if (!Number.isFinite(payload.durationHours) || payload.durationHours <= 0) return
    if (clientSecret || bookingId || isLoadingPayment) return
    if (!acceptedWaiverVersion) {
      setWaiverModalOpen(true)
      return
    }
    if (!acceptedDisclaimers) return
    console.log("[booking-flow] triggering createCheckoutIntent")
    void createCheckoutIntent()
  }, [
    acceptedDisclaimers,
    acceptedWaiverVersion,
    bookingId,
    clientSecret,
    createCheckoutIntent,
    isLoadingPayment,
    payload.durationHours,
    payload.endTime,
    payload.guestCount,
    payload.listingId,
    payload.startTime,
    paymentError,
    step,
  ])

  function handleTermsChange(checked: boolean) {
    setAcceptedTerms(checked)
  }

  async function persistLegalAcceptance() {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        terms_version: LEGAL_VERSIONS.TERMS,
        privacy_version: LEGAL_VERSIONS.PRIVACY,
      }),
    })
  }

  function handleWaiverAccept(version: string) {
    setAcceptedWaiverVersion(version)
    setAcceptedDisclaimers(true) // waiver acceptance covers disclaimers — no separate gate needed
    setWaiverModalOpen(false)
  }

  function handleWaiverDecline() {
    setWaiverModalOpen(false)
    window.location.href = `/listings/${listingId}`
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <WaiverModal
        open={waiverModalOpen}
        listingTitle={listingTitle}
        serviceType={serviceType}
        onAccept={handleWaiverAccept}
        onDecline={handleWaiverDecline}
      />
      <div className="flex flex-wrap gap-2">
        <StepPill isActive={step === 1} label="1. Review" />
        <StepPill isActive={step === 2} label="2. Guest details" />
        <StepPill isActive={step === 3} label="3. Payment" />
      </div>

      {step === 1 ? (
        <Card className="card-base">
          <CardContent className="space-y-5">
            <h1 className="type-h2">Review your booking</h1>

            <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
              {listingPhotoUrl ? (
                <img src={listingPhotoUrl} alt={listingTitle} className="h-44 w-full rounded-lg object-cover" />
              ) : (
                <div className="flex h-44 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                  Listing photo
                </div>
              )}

              <div className="space-y-3 text-sm">
                <p className="text-lg font-medium">{listingTitle}</p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="size-4" />
                  {formatBookingDateTime(payload.sessionDate, payload.startTime, payload.endTime)}
                </p>
                <p className="text-muted-foreground">
                  {payload.guestCount} guests •{" "}
                  {durationConstraints.sessionType === "fixed_session"
                    ? `${Math.round(payload.durationHours * 60)} min session`
                    : `${payload.durationHours} hour session`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Booking slot: {payload.startTime}-{payload.endTime} (
                  {Math.round(payload.durationHours * 60)} min)
                </p>
                {durationConstraints.minMins > 30 ? (
                  <p className="text-xs text-muted-foreground">
                    Minimum session length: {durationConstraints.minMins} minutes
                  </p>
                ) : null}

                <div className="rounded-lg border p-3">
                  <div className="mb-2 text-xs text-muted-foreground">
                    {formatMoney(getPricePerPerson(pricing, payload.guestCount))} × {payload.guestCount} guests ×{" "}
                    {durationConstraints.sessionType === "fixed_session" ? "1 session" : `${payload.durationHours}h`}
                  </div>
                  <div className="flex justify-between">
                    <span>Price per person</span>
                    <span>{formatMoney(getPricePerPerson(pricing, payload.guestCount))}</span>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="text-muted-foreground">Space subtotal</span>
                    <span>{formatMoney(totals.subtotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-muted-foreground">
                      Service fee ({feePercents.guestFeePercent}%)
                    </span>
                    <span>{formatMoney(totals.guestFee)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                    <span>Total</span>
                    <span>{formatMoney(totals.guestTotal)}</span>
                  </div>
                </div>

                {healthDisclaimer ? <p className="text-xs text-muted-foreground">{healthDisclaimer}</p> : null}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="card-base">
          <CardContent className="space-y-5">
            <h2 className="type-h2">Confirm guest details</h2>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCheck className="size-4" />
              Pre-filled from your profile. Review and continue.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="guest-first-name">First name</Label>
                <Input
                  id="guest-first-name"
                  value={guestDetails.firstName ?? ""}
                  onChange={(event) =>
                    setGuestDetails((current) => {
                      const firstName = event.target.value
                      return {
                        ...current,
                        firstName,
                        fullName: buildFullName(firstName, current.lastName),
                      }
                    })
                  }
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-last-name">Last name</Label>
                <Input
                  id="guest-last-name"
                  value={guestDetails.lastName ?? ""}
                  onChange={(event) =>
                    setGuestDetails((current) => {
                      const lastName = event.target.value
                      return {
                        ...current,
                        lastName,
                        fullName: buildFullName(current.firstName, lastName),
                      }
                    })
                  }
                  autoComplete="family-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-phone">Phone</Label>
                <Input
                  id="guest-phone"
                  value={guestDetails.phone}
                  onChange={(event) =>
                    setGuestDetails((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                type="email"
                value={guestDetails.email}
                onChange={(event) =>
                  setGuestDetails((current) => ({ ...current, email: event.target.value }))
                }
              />
            </div>

            {referralWalletCents > 0 ? (
              <label className="flex min-h-11 items-start gap-3 rounded-lg border border-[#E7DED3] bg-[#FCFAF7] p-4">
                <Checkbox
                  checked={applyReferralCredit}
                  onCheckedChange={(checked) => setApplyReferralCredit(Boolean(checked))}
                />
                <span className="text-[13px] leading-5 text-[#1A1410]">
                  Apply {formatMoney(referralWalletCents / 100)} referral credit at checkout (up to what Stripe and
                  host payouts allow).
                </span>
              </label>
            ) : null}

            {paymentError ? <p className="text-sm text-destructive">{paymentError}</p> : null}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Continue to payment
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            <span>Almost done. Complete payment to confirm your booking.</span>
          </div>

          {!stripePromise ? (
            <Card className="card-base">
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CreditCard className="size-4" />
                  <span>Secure payment unavailable</span>
                </div>
                <p className="text-sm text-destructive">
                  Missing Stripe publishable key. Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and reload.
                </p>
              </CardContent>
            </Card>
          ) : clientSecret && bookingId ? (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentStep
                payload={payload}
                bookingId={bookingId}
                acceptedTerms={acceptedTerms}
                acceptedDisclaimers={acceptedDisclaimers}
                newsletterChecked={newsletterChecked}
                onAcceptedTermsChange={handleTermsChange}
                onAcceptedDisclaimersChange={setAcceptedDisclaimers}
                onNewsletterCheckedChange={setNewsletterChecked}
                onLegalAccepted={persistLegalAcceptance}
                instantBook={instantBook}
                cancellationPolicy={cancellationPolicy}
              />
            </Elements>
          ) : acceptedWaiverVersion && !acceptedDisclaimers ? (
            <Card className="card-base">
              <CardContent className="space-y-4 pt-6">
                <p className="text-sm font-medium text-[#1A1410]">Before secure payment</p>
                <label className="flex min-h-11 items-start gap-3 rounded-md px-1 py-2">
                  <Checkbox
                    checked={acceptedDisclaimers}
                    onCheckedChange={(checked) => setAcceptedDisclaimers(Boolean(checked))}
                  />
                  <span className="text-[13px] leading-5 text-[#1A1410]">
                    I have read and agree to the{" "}
                    <Link href="/disclaimer" target="_blank" rel="noopener noreferrer" className="underline">
                      Disclaimers
                    </Link>
                    .
                    <span className="ml-1 text-destructive">*</span>
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  You must accept the Disclaimers before we set up payment. You&apos;ll confirm Terms of Service on the
                  next screen.
                </p>
                {paymentError ? <p className="text-sm text-destructive">{paymentError}</p> : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="card-base">
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CreditCard className="size-4" />
                  <span>{isLoadingPayment ? "Preparing secure payment..." : "Loading payment..."}</span>
                </div>
                {paymentError ? <p className="text-sm text-destructive">{paymentError}</p> : null}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  )
}
