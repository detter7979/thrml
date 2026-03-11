"use client"

import type { ComponentType, FormEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  KeyRound,
  Loader2,
  ShieldAlert,
  UserCog,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SUPPORT_SUBJECTS, SUPPORT_TOPIC_OPTIONS, supportResponseTime, type SupportPriority } from "@/lib/support"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type HelpTile = {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

type GuideItem = {
  question: string
  answer: string
}

type GuideCategory = {
  id: string
  title: string
  items: GuideItem[]
}

type FormState = {
  name: string
  email: string
  subject: string
  bookingId: string
  message: string
}

type BookingOption = {
  id: string
  title: string
  sessionDate: string | null
}

type FormErrors = Partial<Record<keyof FormState, string>>

type SubmissionResult = {
  ticketNumber: string
  email: string
  responseTime: string
}

const SUPPORT_CONTACT_EMAIL = "hello@usethrml.com"
const NO_BOOKING_VALUE = "__none__"

const HELP_TILES: HelpTile[] = [
  { label: "I can't access the space", href: "#access", icon: KeyRound },
  { label: "I need to cancel my booking", href: "#bookings", icon: CalendarX },
  { label: "I haven't received my payout", href: "#payouts", icon: DollarSign },
  { label: "There's an issue with the space", href: "#spaces", icon: AlertTriangle },
  { label: "I need to report a safety concern", href: "#safety", icon: ShieldAlert },
  { label: "My account has a problem", href: "#account", icon: UserCog },
]

const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    id: "access",
    title: "Access & Entry Issues",
    items: [
      {
        question: "I can't get into the space",
        answer:
          "Entry methods vary by host - some use a digital access code sent through the thrml platform, others use a lockbox combination, a door code, a key handoff, or another arrangement described in their listing.\n\nStart by checking your booking confirmation email and the listing's entry instructions for the specific method your host uses. If your host uses a digital code, try copying and pasting it directly from your confirmation rather than typing it manually, and confirm you are at the correct address.\n\nIf you still cannot get in, message the host immediately through your thrml dashboard - hosts are notified right away and most respond within minutes. If you cannot reach the host within 10 minutes of your session start time, email us at hello@usethrml.com with your booking ID and we will step in.",
      },
      {
        question: "I can't find the entrance to the space",
        answer:
          "Check the listing detail page and your booking confirmation email for entry instructions provided by the host. Hosts are responsible for including clear directions and access details for their space. If the instructions are unclear or missing, message the host directly through your dashboard before you leave home - it's always easier to sort out before you're standing outside.",
      },
      {
        question: "I arrived late and can no longer access the space",
        answer:
          "Your booked session window is fixed regardless of entry method. If you arrive after your session end time, a digital access code will have expired and other entry arrangements may no longer be available as another guest could be booked immediately after you.\n\nFor future bookings we recommend arriving a few minutes early. If you believe there was a technical error with your access window - for example your code expired before your session was due to end - contact support with your booking ID and we will look into it.",
      },
    ],
  },
  {
    id: "bookings",
    title: "Booking & Cancellation Issues",
    items: [
      {
        question: "How do I cancel my booking?",
        answer:
          "Go to your dashboard -> My Bookings, find the booking you want to cancel, and click Cancel Booking. If your session is more than 48 hours away you will receive a full refund minus the platform service fee. Cancellations within 48 hours are non-refundable per our cancellation policy.",
      },
      {
        question: "I cancelled but haven't received my refund",
        answer:
          "Refunds are processed immediately on our end but can take 5-10 business days to appear on your statement depending on your bank. If it has been more than 10 business days, email hello@usethrml.com with your booking ID and we will check the status with Stripe.",
      },
      {
        question: "I was charged but my booking didn't confirm",
        answer:
          "This occasionally happens if there was a network issue during checkout. Check your dashboard - if the booking does not appear within 15 minutes of payment, email hello@usethrml.com with your booking ID or the last 4 digits of your card and the charge amount. We will resolve it same day.",
      },
      {
        question: "The host cancelled my booking - what happens?",
        answer:
          "If a host cancels your confirmed booking you receive a full refund including the platform service fee. The refund is processed automatically and should appear within 5-10 business days. You will also receive an email confirmation of the refund.",
      },
      {
        question: "Can I reschedule instead of cancelling?",
        answer:
          "Rescheduling works by cancelling your current booking and rebooking your new time. Standard cancellation terms apply so we recommend rescheduling as far in advance as possible.",
      },
    ],
  },
  {
    id: "payouts",
    title: "Host Payout Issues",
    items: [
      {
        question: "I haven't received my payout",
        answer:
          "Payouts are processed by Stripe Connect after a booking is completed. Stripe's standard payout schedule is 2 business days after the session date for most accounts, though new accounts may have a longer initial hold period.\n\nFirst check your Stripe dashboard at dashboard.stripe.com for payout status. If Stripe shows the payout as sent but it hasn't arrived, contact your bank. If the issue is on Stripe's side contact Stripe support directly as they have access to the transfer details we do not.",
      },
      {
        question: "My Stripe account is showing as not connected",
        answer:
          "Go to your host dashboard -> Account -> Payouts and click Reconnect Stripe. You may need to complete additional identity verification if Stripe has flagged your account. If the issue persists after reconnecting email us at hello@usethrml.com with your host account email.",
      },
      {
        question: "How do I update my payout bank account?",
        answer:
          "Log into your Stripe Express dashboard directly at dashboard.stripe.com to update your bank account details. This is managed entirely by Stripe - thrml does not store or have access to your banking information.",
      },
    ],
  },
  {
    id: "spaces",
    title: "Issues With a Space",
    items: [
      {
        question: "The space was not as described in the listing",
        answer:
          "We take listing accuracy seriously. If what you experienced was materially different from what was described - for example amenities that were listed but not present, or a space that was unclean - email hello@usethrml.com within 24 hours of your session with photos if possible and your booking ID. We review all complaints and take action on hosts who misrepresent their listings, up to and including removal.",
      },
      {
        question: "The equipment wasn't working when I arrived",
        answer:
          "Message the host immediately through your dashboard. If you had trouble accessing the space itself due to an entry issue on the host's side - a lockbox that wouldn't open, a code that was never provided, a key that wasn't where it was supposed to be - that also qualifies for a refund review.\n\nIf the issue cannot be resolved and you were unable to use the space, contact hello@usethrml.com within 24 hours with your booking ID and a description of what happened. Photos help if you have them.",
      },
      {
        question: "The space was not clean",
        answer:
          "Message the host to flag it, then email support with your booking ID and photos. Cleanliness is a core expectation on thrml and we take these reports seriously in our host review process.",
      },
    ],
  },
  {
    id: "safety",
    title: "Safety Concerns",
    items: [
      {
        question: "I feel unsafe or experienced a threatening situation",
        answer:
          "Your safety is the priority. If you are in immediate danger call 911. Once you are safe, report the incident to us immediately at hello@usethrml.com with your booking ID and a description of what happened. We take all safety reports seriously and will investigate promptly. The host's access may be suspended pending review.",
      },
      {
        question: "I want to report a host or guest for misconduct",
        answer:
          "Email hello@usethrml.com with your booking ID, the nature of the concern, and any supporting information. All reports are handled confidentially. We do not share your identity with the person being reported during an investigation.",
      },
      {
        question: "I had a medical issue during a session",
        answer:
          "We hope you are okay. If you required medical attention please prioritize your health first. Once you are well, email us with your booking ID so we can document the incident. This helps us work with the host to prevent similar issues and review the listing's safety information.",
      },
    ],
  },
  {
    id: "account",
    title: "Account Issues",
    items: [
      {
        question: "I can't log in to my account",
        answer:
          'Use the "Forgot password" link on the login page to reset your password by email. If you do not receive the reset email within a few minutes check your spam folder. If the issue persists email hello@usethrml.com from the email address associated with your account.',
      },
      {
        question: "I want to delete my account",
        answer:
          "Email hello@usethrml.com with your account email and request for deletion. We will process it within 30 days per our Privacy Policy. Note that booking and transaction records may be retained for legal and financial compliance purposes as described in our Privacy Policy.",
      },
      {
        question: "I think my account has been compromised",
        answer:
          "Reset your password immediately using the Forgot Password link, then email hello@usethrml.com so we can review recent account activity and flag any suspicious bookings or transactions.",
      },
      {
        question: "How do I update my email address?",
        answer:
          "Go to your dashboard -> Account -> Settings. If the option is not available there, email hello@usethrml.com and we can update it manually after verifying your identity.",
      },
    ],
  },
]

export default function SupportPage() {
  const [openItems, setOpenItems] = useState<Record<string, string | null>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<SubmissionResult | null>(null)
  const [bookings, setBookings] = useState<BookingOption[]>([])
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    subject: "",
    bookingId: "",
    message: "",
  })
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const subjectRef = useRef<HTMLButtonElement>(null)
  const bookingIdInputRef = useRef<HTMLInputElement>(null)
  const bookingIdSelectRef = useRef<HTMLButtonElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setIsAuthenticated(false)
        return
      }

      setIsAuthenticated(true)

      const fallbackEmail = user.email ?? ""
      const fallbackName =
        typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim()
          ? user.user_metadata.full_name.trim()
          : fallbackEmail.split("@")[0] || "thrml user"

      const [{ data: profile }, { data: bookingRows }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("bookings")
          .select("id, session_date, listing:listings(title)")
          .or(`guest_id.eq.${user.id},host_id.eq.${user.id}`)
          .order("session_date", { ascending: false })
          .limit(10),
      ])

      const resolvedName =
        typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : fallbackName

      setForm((current) => ({
        ...current,
        name: resolvedName,
        email: fallbackEmail,
      }))

      const bookingOptions: BookingOption[] =
        bookingRows?.map((booking) => {
          const listing = Array.isArray(booking.listing) ? booking.listing[0] : booking.listing
          const listingTitle =
            listing && typeof listing.title === "string" && listing.title.trim() ? listing.title.trim() : "Untitled listing"
          return {
            id: booking.id,
            sessionDate: booking.session_date,
            title: listingTitle,
          }
        }) ?? []

      setBookings(bookingOptions)
    }

    void loadUser()
  }, [])

  const orderedCategories = useMemo(() => GUIDE_CATEGORIES, [])

  const toggleQuestion = (categoryId: string, question: string) => {
    setOpenItems((current) => ({
      ...current,
      [categoryId]: current[categoryId] === question ? null : question,
    }))
  }

  const updateFormField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const validateForm = () => {
    const errors: FormErrors = {}
    const trimmedName = form.name.trim()
    const trimmedEmail = form.email.trim()
    const trimmedMessage = form.message.trim()

    if (trimmedName.length < 2) errors.name = "Name must be at least 2 characters."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) errors.email = "Enter a valid email address."
    if (!SUPPORT_SUBJECTS.includes(form.subject as (typeof SUPPORT_SUBJECTS)[number])) {
      errors.subject = "Please select a topic."
    }
    if (trimmedMessage.length < 20) errors.message = "Message must be at least 20 characters."
    if (trimmedMessage.length > 500) errors.message = "Message cannot exceed 500 characters."

    const rawBookingId = form.bookingId.trim()
    if (!isAuthenticated && rawBookingId.length > 0) {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidPattern.test(rawBookingId)) {
        errors.bookingId = "Booking reference must be a valid UUID."
      }
    }

    return errors
  }

  const focusFirstInvalidField = (errors: FormErrors) => {
    const order: Array<keyof FormState> = ["name", "email", "subject", "bookingId", "message"]
    const firstInvalid = order.find((field) => Boolean(errors[field]))
    if (!firstInvalid) return

    if (firstInvalid === "name") {
      nameRef.current?.focus()
      return
    }
    if (firstInvalid === "email") {
      emailRef.current?.focus()
      return
    }
    if (firstInvalid === "subject") {
      subjectRef.current?.focus()
      return
    }
    if (firstInvalid === "bookingId") {
      if (isAuthenticated) {
        bookingIdSelectRef.current?.focus()
      } else {
        bookingIdInputRef.current?.focus()
      }
      return
    }
    messageRef.current?.focus()
  }

  const mapServerErrors = (errors: Record<string, string> | null | undefined): FormErrors => {
    if (!errors) return {}
    return {
      name: errors.name,
      email: errors.email,
      subject: errors.subject,
      message: errors.message,
      bookingId: errors.booking_id,
    }
  }

  const formatBookingDate = (value: string | null) => {
    if (!value) return "Date TBD"
    const date = new Date(`${value}T12:00:00`)
    if (Number.isNaN(date.getTime())) return "Date TBD"
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date)
  }

  const resetAfterSuccess = () => {
    setSubmitted(null)
    setSubmitError(null)
    setFieldErrors({})
    setForm((current) => ({
      ...current,
      subject: "",
      bookingId: "",
      message: "",
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setSubmitError(null)
    const formData = new FormData(event.currentTarget)
    const website = typeof formData.get("website") === "string" ? (formData.get("website") as string).trim() : ""

    const nextErrors = validateForm()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(nextErrors)
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject,
          booking_id: form.bookingId.trim() || null,
          message: form.message.trim(),
          website,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string
            errors?: Record<string, string>
            ticket_number?: string
            priority?: SupportPriority
          }
        | null

      if (!response.ok) {
        if (response.status === 400 && payload?.errors) {
          const mappedErrors = mapServerErrors(payload.errors)
          setFieldErrors(mappedErrors)
          focusFirstInvalidField(mappedErrors)
          return
        }
        setSubmitError(`Something went wrong. Please try again or email us at ${SUPPORT_CONTACT_EMAIL}`)
        return
      }

      const priority = payload?.priority === "urgent" || payload?.priority === "high" ? payload.priority : "normal"
      setSubmitted({
        ticketNumber: payload?.ticket_number ?? "TRM-XXXX",
        email: form.email.trim(),
        responseTime: supportResponseTime(priority),
      })
      setFieldErrors({})
    } catch (submitError) {
      console.error("Support form submit failed", submitError)
      setSubmitError(`Something went wrong. Please try again or email us at ${SUPPORT_CONTACT_EMAIL}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl scroll-smooth px-4 py-12 text-[#1A1410] md:px-8 md:py-16">
      <header className="max-w-3xl">
        <h1 className="font-serif text-4xl md:text-5xl">How can we help?</h1>
        <p className="mt-4 text-base text-[#5F5148]">
          Find answers below or send us a message and we&apos;ll get back to you as soon as we can.
        </p>
        <p className="mt-4 text-sm text-[#6B5B50]">
          <Link href="/faq" className="text-[#C75B3A] transition-colors hover:text-[#B45033]">
            Looking for FAQs? Visit our FAQ page &rarr;
          </Link>
        </p>
      </header>

      <section className="mt-10" aria-labelledby="quick-help-heading">
        <h2 id="quick-help-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
          Quick help
        </h2>
        <p className="mt-2 text-sm text-[#5F5148]">Start with the most common issues below.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_TILES.map((tile) => {
            const Icon = tile.icon
            return (
              <a
                key={tile.href}
                href={tile.href}
                className="group rounded-2xl border border-warm-100 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#E4C9B4] hover:shadow-md"
              >
                <Icon className="mx-auto size-6 text-[#7A675B] transition-colors group-hover:text-[#C75B3A]" />
                <p className="mt-3 text-sm font-medium text-[#2F241E]">{tile.label}</p>
              </a>
            )
          })}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="guides-heading">
        <h2 id="guides-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
          Troubleshooting guides
        </h2>
        <p className="mt-2 text-sm text-[#5F5148]">
          We&apos;re a small team, so we designed this page to help you solve most issues quickly on your own.
        </p>

        <div className="mt-6 space-y-10">
          {orderedCategories.map((category) => (
            <section
              key={category.id}
              id={category.id}
              className="scroll-mt-24 rounded-2xl border border-warm-100 bg-white p-5 shadow-sm md:p-6"
              aria-labelledby={`${category.id}-heading`}
            >
              <h3 id={`${category.id}-heading`} className="font-serif text-2xl text-[#1A1410]">
                {category.title}
              </h3>
              <div className="mt-4 space-y-3">
                {category.items.map((item) => {
                  const isOpen = openItems[category.id] === item.question
                  const answerId = `${category.id}-${item.question}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")

                  return (
                    <article key={item.question} className="overflow-hidden rounded-xl border border-warm-100 bg-[#FFFEFD]">
                      <button
                        type="button"
                        onClick={() => toggleQuestion(category.id, item.question)}
                        aria-expanded={isOpen}
                        aria-controls={answerId}
                        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-[15px] font-medium text-[#1A1410] transition-colors hover:bg-[#FCFAF7]"
                      >
                        <span>{item.question}</span>
                        <ChevronDown
                          className={cn(
                            "size-5 shrink-0 text-[#6D5D52] transition-transform duration-300",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                      <div
                        className={cn(
                          "grid transition-all duration-300 ease-out",
                          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        )}
                      >
                        <div className="overflow-hidden">
                          <p
                            id={answerId}
                            className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-[#2F241E] md:text-[15px]"
                          >
                            {item.answer}
                          </p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section
        className="mt-14 rounded-2xl border border-warm-100 bg-white p-6 shadow-sm md:p-8"
        aria-labelledby="contact-heading"
      >
        <h2 id="contact-heading" className="font-serif text-2xl text-[#1A1410] md:text-3xl">
          Still need help?
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#5F5148]">
          Send us a message and we&apos;ll get back to you as soon as we can. We&apos;re a small team so we appreciate your
          patience.
        </p>

        {submitted ? (
          <div className="mt-6 rounded-xl border border-[#D7E8DC] bg-[#F7FCF8] p-6 text-[#2F241E]">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-6 text-[#2E8E57]" />
              <div>
                <h3 className="font-serif text-2xl text-[#1A1410]">Message sent</h3>
                <p className="mt-1 text-sm text-[#4D4138]">Check your inbox for a confirmation.</p>
              </div>
            </div>
            <p className="mt-5 text-center text-3xl font-bold tracking-wide text-[#C75B3A]">{submitted.ticketNumber}</p>
            <p className="mt-3 text-sm text-[#4D4138]">
              We&apos;ll get back to you at {submitted.email} {submitted.responseTime}.
            </p>
            <button
              type="button"
              onClick={resetAfterSuccess}
              className="mt-5 text-sm font-medium text-[#C75B3A] transition-colors hover:text-[#B45033]"
            >
              Submit another request →
            </button>
          </div>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            {/* Honeypot - hidden from real users, bots will fill this */}
            <input
              type="text"
              name="website"
              autoComplete="off"
              tabIndex={-1}
              aria-hidden="true"
              style={{ display: "none" }}
            />
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="support-name">
                  {isAuthenticated && form.name ? `Logged in as ${form.name}` : "Name"}
                </Label>
                <Input
                  ref={nameRef}
                  id="support-name"
                  required
                  value={form.name}
                  onChange={(event) => updateFormField("name", event.target.value)}
                  readOnly={isAuthenticated}
                  disabled={isSubmitting}
                  className="h-11 border-warm-100 bg-[#FCFAF7]"
                />
                {fieldErrors.name ? <p className="text-xs text-[#B93838]">{fieldErrors.name}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-email">Email</Label>
                <Input
                  ref={emailRef}
                  id="support-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => updateFormField("email", event.target.value)}
                  readOnly={isAuthenticated}
                  disabled={isSubmitting}
                  className="h-11 border-warm-100 bg-[#FCFAF7]"
                />
                {fieldErrors.email ? <p className="text-xs text-[#B93838]">{fieldErrors.email}</p> : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-subject">Topic</Label>
              <Select
                value={form.subject}
                onValueChange={(value) => updateFormField("subject", value)}
                disabled={isSubmitting}
              >
                <SelectTrigger
                  ref={subjectRef}
                  id="support-subject"
                  className={cn(
                    "h-11 w-full border-warm-100 bg-[#FCFAF7] text-[#1A1410] data-[placeholder]:text-[#7C6A5F]",
                    fieldErrors.subject ? "border-[#B93838]" : ""
                  )}
                >
                  <SelectValue placeholder="— Select a topic —" />
                </SelectTrigger>
                <SelectContent className="z-[400] border-warm-100 bg-[#FFFEFD] text-[#1A1410]">
                  {SUPPORT_TOPIC_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="cursor-pointer text-[#2F241E] focus:bg-[#F7ECE3] focus:text-[#1A1410]"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.subject ? <p className="text-xs text-[#B93838]">{fieldErrors.subject}</p> : null}
            </div>

            {isAuthenticated ? (
              <div className="space-y-2">
                <Label htmlFor="support-booking-id-select">Booking Reference (optional)</Label>
                <Select
                  value={form.bookingId || NO_BOOKING_VALUE}
                  onValueChange={(value) => updateFormField("bookingId", value === NO_BOOKING_VALUE ? "" : value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger
                    ref={bookingIdSelectRef}
                    id="support-booking-id-select"
                    className={cn(
                      "h-11 w-full border-warm-100 bg-[#FCFAF7] text-[#1A1410] data-[placeholder]:text-[#7C6A5F]",
                      fieldErrors.bookingId ? "border-[#B93838]" : ""
                    )}
                  >
                    <SelectValue placeholder="Not related to a booking" />
                  </SelectTrigger>
                  <SelectContent className="z-[400] border-warm-100 bg-[#FFFEFD] text-[#1A1410]">
                    <SelectItem
                      value={NO_BOOKING_VALUE}
                      className="cursor-pointer text-[#2F241E] focus:bg-[#F7ECE3] focus:text-[#1A1410]"
                    >
                      Not related to a booking
                    </SelectItem>
                    {bookings.map((booking) => (
                      <SelectItem
                        key={booking.id}
                        value={booking.id}
                        className="cursor-pointer text-[#2F241E] focus:bg-[#F7ECE3] focus:text-[#1A1410]"
                      >
                      {`${booking.title} · ${formatBookingDate(booking.sessionDate)} (#${booking.id.slice(0, 8)})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.bookingId ? <p className="text-xs text-[#B93838]">{fieldErrors.bookingId}</p> : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="support-booking-id">Booking Reference (optional)</Label>
                <Input
                  ref={bookingIdInputRef}
                  id="support-booking-id"
                  value={form.bookingId}
                  onChange={(event) => updateFormField("bookingId", event.target.value)}
                  placeholder="Booking ID from your confirmation email"
                  disabled={isSubmitting}
                  className="h-11 border-warm-100 bg-[#FCFAF7]"
                />
                <p className="text-xs text-[#6B5B50]">
                  Optional - include if your issue relates to a specific booking.
                </p>
                {fieldErrors.bookingId ? <p className="text-xs text-[#B93838]">{fieldErrors.bookingId}</p> : null}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="support-message">Message</Label>
              <Textarea
                ref={messageRef}
                id="support-message"
                required
                rows={5}
                minLength={20}
                maxLength={500}
                value={form.message}
                onChange={(event) => updateFormField("message", event.target.value)}
                placeholder="Please describe your issue in as much detail as possible..."
                disabled={isSubmitting}
                className="min-h-36 border-warm-100 bg-[#FCFAF7]"
              />
              <p
                className={cn(
                  "text-right text-xs",
                  form.message.length >= 500
                    ? "text-[#B93838]"
                    : form.message.length >= 450
                      ? "text-[#B37413]"
                      : "text-[#6B5B50]"
                )}
              >
                {form.message.length} / 500
              </p>
              {fieldErrors.message ? <p className="text-xs text-[#B93838]">{fieldErrors.message}</p> : null}
            </div>

            <div className="space-y-2">
              {submitError ? (
                <p className="rounded-md border border-[#F0C7C7] bg-[#FFF5F5] px-3 py-2 text-sm text-[#B93838]">
                  {submitError}
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={isSubmitting || form.message.length >= 500}
                className="w-full rounded-full bg-[#C75B3A] px-6 text-white hover:bg-[#B45033] sm:w-auto"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Sending...
                  </span>
                ) : (
                  "Send message"
                )}
              </Button>
            </div>
          </form>
        )}
      </section>

      <p className="mt-8 text-sm text-[#6B5B50]">
        <Link href="/faq" className="text-[#C75B3A] transition-colors hover:text-[#B45033]">
          Looking for FAQs? Visit our FAQ page &rarr;
        </Link>
      </p>
    </main>
  )
}
