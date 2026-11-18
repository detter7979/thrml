"use client"

import Link from "next/link"
import { useId, useState, type FormEvent, type ReactNode } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { trackMetaEvent } from "@/components/meta-pixel"
import { Button } from "@/components/ui/button"
import { trackGaEvent } from "@/lib/analytics/ga"
import type { OwnsSauna } from "@/lib/host/host-applications"

type Founding = { cap: number; spotsLeft: number; feePercent: number; windowDays: number } | null

const SAUNA_TYPES = [
  "Barrel sauna (outdoor)",
  "Cabin / outbuilding sauna",
  "Indoor sauna (in the house)",
  "Infrared sauna",
  "Other",
]

function readUtm(key: string): string | undefined {
  if (typeof window === "undefined") return undefined
  return new URLSearchParams(window.location.search).get(key) ?? undefined
}

function Choice({
  selected,
  onClick,
  title,
  body,
}: {
  selected: boolean
  onClick: () => void
  title: string
  body: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-2xl border p-5 text-left transition ${
        selected ? "border-[#C75B3A] bg-[#FBEFEA]" : "border-warm-200 bg-white hover:border-[#C75B3A]/60"
      }`}
    >
      <p className="font-medium text-[#1A1410]">{title}</p>
      <p className="mt-1 text-sm text-warm-700">{body}</p>
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[#1A1410]">{label}</span>
      {hint ? <span className="ml-2 text-xs text-warm-600">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

const inputClass =
  "h-12 w-full rounded-xl border border-warm-200 bg-white px-4 text-base text-[#1A1410] outline-none placeholder:text-[#8E8176] focus:border-[#C75B3A]"

function Radio<T extends string>({
  name,
  value,
  current,
  onChange,
  label,
}: {
  name: string
  value: T
  current: T | ""
  onChange: (v: T) => void
  label: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        current === value ? "border-[#C75B3A] bg-[#FBEFEA]" : "border-warm-200 bg-white"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className="accent-[#C75B3A]"
      />
      {label}
    </label>
  )
}

export function HostApplicationClient({
  founding,
  standardFeePercent,
}: {
  founding: Founding
  standardFeePercent: number | null
}) {
  const ids = useId()
  const [owns, setOwns] = useState<OwnsSauna | null>(null)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [saunaType, setSaunaType] = useState("")
  const [privateAccess, setPrivateAccess] = useState<"yes" | "partly" | "no" | "">("")
  const [availability, setAvailability] = useState<"1-2" | "3-4" | "5+" | "">("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  const spotsCopy =
    founding && founding.spotsLeft > 0
      ? `${founding.spotsLeft} of ${founding.cap} founding spots open`
      : founding
        ? "Founding spots are full — apply for the next group"
        : null

  function choose(value: OwnsSauna) {
    setOwns(value)
    setError(null)
    trackGaEvent("host_application_started", { owns_sauna: value })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!owns || status !== "idle") return
    const form = new FormData(event.currentTarget)
    const website = typeof form.get("website") === "string" ? (form.get("website") as string) : ""

    if (owns === "yes" && (!privateAccess || !availability)) {
      setError("Please answer the guest access and availability questions.")
      return
    }

    setStatus("saving")
    setError(null)
    try {
      const res = await fetch("/api/host-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owns_sauna: owns,
          email,
          full_name: fullName,
          neighborhood,
          ...(owns === "yes"
            ? { phone, sauna_type: saunaType, private_access: privateAccess, availability, notes }
            : {}),
          website,
          signup_path: window.location.pathname,
          utm_source: readUtm("utm_source"),
          utm_campaign: readUtm("utm_campaign"),
        }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(payload?.error ?? "Something went wrong. Please try again.")

      const category = owns === "yes" ? "owner" : "future"
      trackGaEvent("host_application_submitted", { owns_sauna: owns })
      trackMetaEvent(
        "host_application_submitted",
        { content_name: "host_application", content_category: category },
        { custom: true }
      )
      setStatus("done")
    } catch (e) {
      setStatus("idle")
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
    }
  }

  if (status === "done") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FCFAF7] px-6">
        <div className="max-w-md text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
          <h1 className="mt-4 font-serif text-3xl text-[#1A1410]">
            {owns === "yes" ? "Thanks, we got it." : "You're on the list."}
          </h1>
          <p className="mt-3 text-warm-700">
            {owns === "yes"
              ? "We read every application ourselves. If your sauna fits this first group, we'll reach out within a few days. If not, you're on the list for the next one."
              : "We'll let you know when we open the next round of hosts. In the meantime, the estimate on our host page shows what a sauna could earn."}
          </p>
          <Link href="/become-a-host" className="mt-6 inline-block text-sm text-[#C75B3A] underline underline-offset-4">
            Back to thrml for hosts
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#FCFAF7] px-6 py-10">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="font-serif text-2xl lowercase tracking-tight text-[#1A1410]">
          thrml
        </Link>

        <p className="type-label mt-10 text-[#C75B3A]">Founding hosts · Seattle</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-[#1A1410]">Apply to host your sauna</h1>
        <p className="mt-3 text-warm-700">
          We&apos;re starting with a small group of hand-picked hosts, and we&apos;ll help set up your listing and
          photos ourselves.
          {founding && standardFeePercent !== null && founding.feePercent < standardFeePercent
            ? ` Founding hosts pay a ${founding.feePercent}% host fee (instead of ${standardFeePercent}%) for their first ${founding.windowDays} days.`
            : null}
        </p>
        {spotsCopy ? (
          <p className="mt-4 inline-block rounded-full border border-warm-200 bg-white px-3 py-1 text-xs text-[#5D4E43]">
            {spotsCopy}
          </p>
        ) : null}

        <section className="mt-8 space-y-3" aria-labelledby={`${ids}-q1`}>
          <h2 id={`${ids}-q1`} className="text-lg font-medium text-[#1A1410]">
            Do you have a sauna at home today?
          </h2>
          <Choice
            selected={owns === "yes"}
            onClick={() => choose("yes")}
            title="Yes, I have one"
            body="Apply to be a founding host. Takes about two minutes."
          />
          <Choice
            selected={owns === "planning"}
            onClick={() => choose("planning")}
            title="Not yet, but I'm planning to get one"
            body="Join the future-host list and we'll reach out when you're ready."
          />
          <Choice
            selected={owns === "exploring"}
            onClick={() => choose("exploring")}
            title="Just exploring"
            body="Leave your email and we'll keep you posted."
          />
        </section>

        {owns ? (
          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <input type="text" name="website" autoComplete="off" tabIndex={-1} aria-hidden="true" style={{ display: "none" }} />

            {owns === "yes" ? (
              <Field label="Your name">
                <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
              </Field>
            ) : null}
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label={owns === "yes" ? "Where is the sauna?" : "Neighborhood or city"} hint={owns === "yes" ? "Neighborhood or city is fine" : "optional"}>
              <input
                className={inputClass}
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="e.g. Ballard, Shoreline, Kirkland"
                required={owns === "yes"}
              />
            </Field>

            {owns === "yes" ? (
              <>
                <Field label="What kind of sauna?">
                  <select className={inputClass} value={saunaType} onChange={(e) => setSaunaType(e.target.value)} required>
                    <option value="" disabled>
                      Choose one
                    </option>
                    {SAUNA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>

                <fieldset>
                  <legend className="text-sm font-medium text-[#1A1410]">How would guests get to it?</legend>
                  <div className="mt-1.5 grid gap-2">
                    <Radio name="access" value="yes" current={privateAccess} onChange={setPrivateAccess} label="Separate entrance, private for guests" />
                    <Radio name="access" value="partly" current={privateAccess} onChange={setPrivateAccess} label="Shared entry, but the sauna area is private" />
                    <Radio name="access" value="no" current={privateAccess} onChange={setPrivateAccess} label="Through the main house" />
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-medium text-[#1A1410]">How many days a week could you host?</legend>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <Radio name="availability" value="1-2" current={availability} onChange={setAvailability} label="1–2" />
                    <Radio name="availability" value="3-4" current={availability} onChange={setAvailability} label="3–4" />
                    <Radio name="availability" value="5+" current={availability} onChange={setAvailability} label="5+" />
                  </div>
                </fieldset>

                <Field label="Phone" hint="optional, for a quick call">
                  <input className={inputClass} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>

                <Field label="Anything else we should know?" hint="optional">
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-warm-200 bg-white px-4 py-3 text-base text-[#1A1410] outline-none focus:border-[#C75B3A]"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Cold plunge, shower, parking, best times…"
                    maxLength={1000}
                  />
                </Field>
              </>
            ) : null}

            {error ? <p className="text-sm text-[#A3402A]">{error}</p> : null}

            <Button
              type="submit"
              disabled={status === "saving"}
              className="h-12 w-full rounded-full bg-[#C75B3A] text-base font-medium text-white hover:bg-[#B45033]"
            >
              {status === "saving" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Sending…
                </span>
              ) : owns === "yes" ? (
                "Send application"
              ) : (
                "Join the future-host list"
              )}
            </Button>
            <p className="text-center text-xs text-warm-600">
              We&apos;ll only use this to follow up about hosting. See our{" "}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </p>
          </form>
        ) : null}

        <p className="mt-10 text-center text-sm text-warm-600">
          Already invited by Dom or Casie?{" "}
          <Link href="/become-a-host?start=1" className="text-[#C75B3A] underline underline-offset-4">
            Continue your host setup
          </Link>
        </p>
      </div>
    </main>
  )
}
