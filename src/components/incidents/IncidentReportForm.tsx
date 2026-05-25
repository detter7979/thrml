"use client"

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"

import { IncidentEvidenceUpload } from "@/components/incidents/IncidentEvidenceUpload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type IncidentReportFormProps = {
  bookingId: string
  userId: string
  initialIncidentId?: string | null
}

type Severity = "minor" | "moderate" | "severe"

const MIN_NARRATIVE_LENGTH = 10
const DETAIL_HELPER =
  "The more detail you provide, the faster we can support you and document this properly."

function OptionalLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-[#1A1410]">
      {children} <span className="font-normal text-[#9D8D80]">(optional)</span>
    </Label>
  )
}

function BooleanToggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: boolean | null
  onChange: (next: boolean | null) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[#1A1410]">
        {label} <span className="font-normal text-[#9D8D80]">(optional)</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium transition disabled:opacity-50",
            value === true
              ? "border-[#1A1410] bg-[#1A1410] text-white"
              : "border-[#D7CCBE] bg-white text-[#45372D]"
          )}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium transition disabled:opacity-50",
            value === false
              ? "border-[#1A1410] bg-[#1A1410] text-white"
              : "border-[#D7CCBE] bg-white text-[#45372D]"
          )}
        >
          No
        </button>
      </div>
    </div>
  )
}

export function IncidentReportForm({
  bookingId,
  userId,
  initialIncidentId = null,
}: IncidentReportFormProps) {
  const supabase = createClient()
  const incidentIdRef = useRef<string | null>(initialIncidentId)
  const ensureIncidentPromiseRef = useRef<Promise<string> | null>(null)

  const [incidentId, setIncidentId] = useState<string | null>(initialIncidentId)
  const [incidentAt, setIncidentAt] = useState("")
  const [locationInSpace, setLocationInSpace] = useState("")
  const [injuryType, setInjuryType] = useState("")
  const [bodyArea, setBodyArea] = useState("")
  const [severity, setSeverity] = useState<Severity | "">("")
  const [soughtMedicalAttention, setSoughtMedicalAttention] = useState<boolean | null>(null)
  const [erOr911Involved, setErOr911Involved] = useState<boolean | null>(null)
  const [narrative, setNarrative] = useState("")
  const [witnessInfo, setWitnessInfo] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasActiveUploads, setHasActiveUploads] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const narrativeLength = narrative.trim().length
  const canSubmit = narrativeLength >= MIN_NARRATIVE_LENGTH && !isSubmitting && !hasActiveUploads
  const showSoftNarrativeHint = narrative.length > 0 && narrativeLength < MIN_NARRATIVE_LENGTH

  const ensureIncidentId = useCallback(async () => {
    if (incidentIdRef.current) return incidentIdRef.current
    if (ensureIncidentPromiseRef.current) return ensureIncidentPromiseRef.current

    ensureIncidentPromiseRef.current = (async () => {
      const { data: existing, error: existingError } = await supabase
        .from("incident_reports")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("reporter_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingError) {
        throw new Error(existingError.message)
      }

      if (existing?.id) {
        incidentIdRef.current = existing.id
        setIncidentId(existing.id)
        return existing.id
      }

      const { data, error } = await supabase
        .from("incident_reports")
        .insert({
          booking_id: bookingId,
          reporter_user_id: userId,
          evidence_paths: [],
          narrative: "",
        })
        .select("id")
        .single()

      if (error || !data?.id) {
        throw new Error(error?.message ?? "Unable to start evidence upload")
      }

      incidentIdRef.current = data.id
      setIncidentId(data.id)
      return data.id
    })()

    try {
      return await ensureIncidentPromiseRef.current
    } finally {
      ensureIncidentPromiseRef.current = null
    }
  }, [bookingId, supabase, userId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const incidentAtIso = incidentAt.trim() ? new Date(incidentAt).toISOString() : null
      const payload = {
        booking_id: bookingId,
        reporter_user_id: userId,
        incident_at: incidentAtIso,
        location_in_space: locationInSpace.trim() || null,
        injury_type: injuryType.trim() || null,
        body_area: bodyArea.trim() || null,
        severity: severity || null,
        sought_medical_attention: soughtMedicalAttention,
        er_or_911_involved: erOr911Involved,
        narrative: narrative.trim(),
        witness_info: witnessInfo.trim() || null,
      }

      if (incidentIdRef.current) {
        const { error } = await supabase.from("incident_reports").update(payload).eq("id", incidentIdRef.current)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from("incident_reports").insert(payload)
        if (error) throw new Error(error.message)
      }

      setSubmitted(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to submit incident report")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-[#D7E8DC] bg-[#F7FCF8] p-6 text-[#2F241E]">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-[#2E8E57]" />
          <div>
            <h2 className="font-serif text-2xl text-[#1A1410]">Report received</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#5F5148]">
              Thank you for taking the time to document what happened. Our team will review this and reach out if we
              need anything else. Your wellbeing matters to us.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/bookings"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#1F1712] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#120d0a]"
        >
          Back to your bookings
        </Link>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      <p className="rounded-xl border border-[#E8DDD2] bg-[#FFFCF8] px-4 py-3 text-sm leading-relaxed text-[#6C5B4F]">
        {DETAIL_HELPER}
      </p>

      <div className="space-y-2">
        <OptionalLabel htmlFor="incident-at">When did the incident occur?</OptionalLabel>
        <Input
          id="incident-at"
          type="datetime-local"
          value={incidentAt}
          disabled={isSubmitting}
          onChange={(event) => setIncidentAt(event.target.value)}
          className="h-11 border-[#E2D8CC] bg-white text-[#2C231D]"
        />
      </div>

      <div className="space-y-2">
        <OptionalLabel htmlFor="location-in-space">Where in the space did this happen?</OptionalLabel>
        <Input
          id="location-in-space"
          value={locationInSpace}
          disabled={isSubmitting}
          placeholder="e.g. sauna bench, cold plunge area, entryway"
          onChange={(event) => setLocationInSpace(event.target.value)}
          className="h-11 border-[#E2D8CC] bg-white text-[#2C231D]"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <OptionalLabel htmlFor="injury-type">Type of injury or incident</OptionalLabel>
          <Input
            id="injury-type"
            value={injuryType}
            disabled={isSubmitting}
            placeholder="e.g. burn, slip, heat-related"
            onChange={(event) => setInjuryType(event.target.value)}
            className="h-11 border-[#E2D8CC] bg-white text-[#2C231D]"
          />
        </div>
        <div className="space-y-2">
          <OptionalLabel htmlFor="body-area">Body area affected</OptionalLabel>
          <Input
            id="body-area"
            value={bodyArea}
            disabled={isSubmitting}
            placeholder="e.g. hand, ankle, lower back"
            onChange={(event) => setBodyArea(event.target.value)}
            className="h-11 border-[#E2D8CC] bg-white text-[#2C231D]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <OptionalLabel htmlFor="severity">Severity</OptionalLabel>
        <Select
          value={severity || undefined}
          onValueChange={(value) => setSeverity(value as Severity)}
          disabled={isSubmitting}
        >
          <SelectTrigger
            id="severity"
            className="h-11 w-full border-[#E2D8CC] bg-white text-[#2C231D] data-[placeholder]:text-[#9D8D80]"
          >
            <SelectValue placeholder="Select severity if known" />
          </SelectTrigger>
          <SelectContent className="z-[400] border-[#E2D8CC] bg-white text-[#1A1410]">
            <SelectItem value="minor" className="cursor-pointer focus:bg-[#F7ECE3] focus:text-[#1A1410]">
              Minor
            </SelectItem>
            <SelectItem value="moderate" className="cursor-pointer focus:bg-[#F7ECE3] focus:text-[#1A1410]">
              Moderate
            </SelectItem>
            <SelectItem value="severe" className="cursor-pointer focus:bg-[#F7ECE3] focus:text-[#1A1410]">
              Severe
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <BooleanToggle
        label="Did you seek medical attention?"
        value={soughtMedicalAttention}
        onChange={setSoughtMedicalAttention}
        disabled={isSubmitting}
      />

      <BooleanToggle
        label="Were emergency services (911 or ER) involved?"
        value={erOr911Involved}
        onChange={setErOr911Involved}
        disabled={isSubmitting}
      />

      <div className="space-y-2">
        <Label htmlFor="narrative" className="text-[#1A1410]">
          What happened?
        </Label>
        <Textarea
          id="narrative"
          value={narrative}
          disabled={isSubmitting}
          rows={6}
          maxLength={5000}
          placeholder="Please describe what happened in your own words. Even a brief summary helps us document and support you."
          className="min-h-[140px] resize-none rounded-xl border-[#E2D8CC] bg-white text-sm text-[#2C231D]"
          onChange={(event) => {
            setNarrative(event.target.value)
            const el = event.currentTarget
            el.style.height = "auto"
            el.style.height = `${el.scrollHeight}px`
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <p className={cn("text-xs", showSoftNarrativeHint ? "text-amber-700" : "text-[#9D8D80]")}>
            {showSoftNarrativeHint
              ? `Please add at least ${MIN_NARRATIVE_LENGTH} characters so we can understand what happened.`
              : "Required — a short summary is enough."}
          </p>
          {narrative.length > 0 ? (
            <p className={cn("text-xs", narrative.length >= 5000 ? "text-rose-700" : "text-[#9D8D80]")}>
              {narrative.length}/5000
            </p>
          ) : null}
        </div>
      </div>

      <IncidentEvidenceUpload
        userId={userId}
        incidentId={incidentId}
        ensureIncidentId={ensureIncidentId}
        disabled={isSubmitting || submitted}
        onUploadActivityChange={setHasActiveUploads}
      />

      <div className="space-y-2">
        <OptionalLabel htmlFor="witness-info">Witness information</OptionalLabel>
        <Textarea
          id="witness-info"
          value={witnessInfo}
          disabled={isSubmitting}
          rows={3}
          maxLength={2000}
          placeholder="Names, contact details, or anything others saw (if applicable)"
          className="min-h-[88px] resize-none rounded-xl border-[#E2D8CC] bg-white text-sm text-[#2C231D]"
          onChange={(event) => setWitnessInfo(event.target.value)}
        />
      </div>

      {errorMessage ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      ) : null}

      <Button
        type="submit"
        disabled={!canSubmit}
        className="h-12 w-full rounded-xl bg-[#C75B3A] text-base font-semibold text-white hover:bg-[#B24E31]"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit incident report"
        )}
      </Button>

      <p className="text-center text-xs text-[#8D7D70]">
        If you are in immediate danger, call 911. For urgent help, email{" "}
        <a href="mailto:hello@usethrml.com" className="text-[#C75B3A] hover:text-[#B45033]">
          hello@usethrml.com
        </a>
        .
      </p>
    </form>
  )
}
