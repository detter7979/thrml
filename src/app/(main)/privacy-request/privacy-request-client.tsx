"use client"

import type { FormEvent } from "react"
import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { CookieSettingsLink } from "@/components/cookie-settings-link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  PRIVACY_REQUEST_TYPES,
  type PrivacyRequestType,
  US_STATES_AND_TERRITORIES,
} from "@/lib/privacy-request"

type FormState = {
  name: string
  email: string
  state: string
  requestType: string
  details: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

type SubmissionResult = {
  ticketNumber: string
  email: string
  requestType: PrivacyRequestType
}

const CONTACT_EMAIL = "hello@usethrml.com"

export function PrivacyRequestClient({
  initialName = "",
  initialEmail = "",
}: {
  initialName?: string
  initialEmail?: string
}) {
  const [form, setForm] = useState<FormState>({
    name: initialName,
    email: initialEmail,
    state: "",
    requestType: "",
    details: "",
  })
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<SubmissionResult | null>(null)

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function validateClient(): FormErrors {
    const errors: FormErrors = {}
    if (form.name.trim().length < 2) errors.name = "Full name is required."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = "Enter a valid email address."
    }
    if (!form.state) errors.state = "Select your state of residence."
    if (!form.requestType) errors.requestType = "Select a request type."
    if (form.details.length > 2000) errors.details = "Details cannot exceed 2,000 characters."
    return errors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const website =
      typeof (event.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value === "string"
        ? ((event.currentTarget.elements.namedItem("website") as HTMLInputElement).value ?? "").trim()
        : ""

    const nextErrors = validateClient()
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/privacy-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          state: form.state,
          request_type: form.requestType,
          details: form.details.trim(),
          website,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; errors?: Record<string, string>; ticket_number?: string; request_type?: PrivacyRequestType }
        | null

      if (!response.ok) {
        if (response.status === 400 && payload?.errors) {
          setFieldErrors({
            name: payload.errors.name,
            email: payload.errors.email,
            state: payload.errors.state,
            requestType: payload.errors.request_type,
            details: payload.errors.details,
          })
          return
        }
        setSubmitError(`Something went wrong. Please try again or email ${CONTACT_EMAIL}.`)
        return
      }

      setSubmitted({
        ticketNumber: payload?.ticket_number ?? "TRM-XXXX",
        email: form.email.trim(),
        requestType: payload?.request_type ?? (form.requestType as PrivacyRequestType),
      })
      setFieldErrors({})
    } catch {
      setSubmitError(`Something went wrong. Please try again or email ${CONTACT_EMAIL}.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetForm() {
    setSubmitted(null)
    setSubmitError(null)
    setForm((current) => ({
      ...current,
      state: "",
      requestType: "",
      details: "",
    }))
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-[#D7E8DC] bg-[#F7FCF8] p-6 md:p-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 text-[#2E8E57]" />
          <div>
            <h2 className="font-serif text-2xl text-[#1A1410]">Request received</h2>
            <p className="mt-1 text-sm text-[#4D4138]">
              We received your privacy request and will respond within 30 days. Check your inbox for a confirmation.
            </p>
          </div>
        </div>
        <p className="mt-5 text-center text-3xl font-bold tracking-wide text-[#C75B3A]">{submitted.ticketNumber}</p>
        <p className="mt-3 text-center text-sm text-[#4D4138]">Confirmation sent to {submitted.email}</p>

        {submitted.requestType === "opt_out_sale_sharing" ? (
          <div className="mt-6 rounded-xl border border-[#E8DDD6] bg-white p-4 text-center">
            <p className="text-sm text-[#4D4138]">
              You can also opt out of sale or sharing on this device right now:
            </p>
            <CookieSettingsLink className="mt-3 inline-flex rounded-full bg-[#C4623A] px-5 py-2 text-sm font-medium text-white hover:bg-[#b05530]" />
          </div>
        ) : null}

        <button
          type="button"
          onClick={resetForm}
          className="mt-6 block w-full text-center text-sm font-medium text-[#C75B3A] hover:text-[#B45033]"
        >
          Submit another request →
        </button>
      </div>
    )
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
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
          <Label htmlFor="privacy-name">Full name</Label>
          <Input
            id="privacy-name"
            required
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            disabled={isSubmitting}
            className="h-11 border-warm-100 bg-[#FCFAF7]"
          />
          {fieldErrors.name ? <p className="text-xs text-[#B93838]">{fieldErrors.name}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="privacy-email">Email</Label>
          <Input
            id="privacy-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            disabled={isSubmitting}
            className="h-11 border-warm-100 bg-[#FCFAF7]"
          />
          {fieldErrors.email ? <p className="text-xs text-[#B93838]">{fieldErrors.email}</p> : null}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="privacy-state">State of residence</Label>
          <Select
            value={form.state || undefined}
            onValueChange={(value) => updateField("state", value)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="privacy-state" className="h-11 w-full border-warm-100 bg-[#FCFAF7]">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES_AND_TERRITORIES.map((state) => (
                <SelectItem key={state.value} value={state.value}>
                  {state.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.state ? <p className="text-xs text-[#B93838]">{fieldErrors.state}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="privacy-request-type">Request type</Label>
          <Select
            value={form.requestType || undefined}
            onValueChange={(value) => updateField("requestType", value)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="privacy-request-type" className="h-11 w-full border-warm-100 bg-[#FCFAF7]">
              <SelectValue placeholder="Select request type" />
            </SelectTrigger>
            <SelectContent>
              {PRIVACY_REQUEST_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.requestType ? <p className="text-xs text-[#B93838]">{fieldErrors.requestType}</p> : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="privacy-details">Details (optional)</Label>
        <Textarea
          id="privacy-details"
          value={form.details}
          onChange={(e) => updateField("details", e.target.value)}
          disabled={isSubmitting}
          rows={5}
          placeholder="Any additional context that will help us process your request."
          className="border-warm-100 bg-[#FCFAF7]"
        />
        {fieldErrors.details ? <p className="text-xs text-[#B93838]">{fieldErrors.details}</p> : null}
      </div>

      <p className="text-sm leading-relaxed text-[#5F5148]">
        We will verify your identity using the email you provide before fulfilling access or deletion requests.
      </p>

      {submitError ? <p className="text-sm text-[#B93838]">{submitError}</p> : null}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 rounded-full bg-[#C4623A] px-8 text-white hover:bg-[#b05530]"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit privacy request"
        )}
      </Button>
    </form>
  )
}
