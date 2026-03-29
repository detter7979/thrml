"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Camera, CheckCircle2, Mail } from "lucide-react"
import { Suspense, type FormEvent, useEffect, useMemo, useState } from "react"

import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LEGAL_VERSIONS } from "@/lib/legal-config"
import { sanitizeNextPath } from "@/lib/sanitize-next-path"
import { trackGaEvent } from "@/lib/analytics/ga"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type SignupStep = 1 | 2 | 3
type IntentOption = "guest" | "host" | "both"

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10)
  if (!digits) return ""
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function SignupForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedNext = sanitizeNextPath(searchParams.get("next"), null)
  const [step, setStep] = useState<SignupStep>(1)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [intent, setIntent] = useState<IntentOption>("guest")
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [signupTermsAccepted, setSignupTermsAccepted] = useState(false)
  const [signupNewsletterOptIn, setSignupNewsletterOptIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const passwordScore = useMemo(() => {
    let score = 0
    if (password.length >= 8) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    return score
  }, [password])
  const fullName = `${firstName} ${lastName}`.trim()

  function getPostSignupDestination() {
    if (requestedNext) return requestedNext
    return intent === "host" ? "/dashboard" : "/"
  }

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = window.setInterval(() => setResendCooldown((prev) => Math.max(0, prev - 1)), 1000)
    return () => window.clearInterval(id)
  }, [resendCooldown])

  useEffect(() => {
    if (step !== 3) return
    const id = window.setInterval(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email_confirmed_at) {
        router.push(getPostSignupDestination())
        router.refresh()
      }
    }, 3000)
    return () => window.clearInterval(id)
  }, [requestedNext, intent, router, step, supabase.auth])

  async function uploadAvatar(userId: string) {
    if (!photoFile) return null
    const extension = photoFile.name.split(".").pop() ?? "jpg"
    const path = `${userId}/${Date.now()}.${extension}`
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, photoFile, {
      upsert: true,
      cacheControl: "3600",
    })
    if (uploadError) return null

    const { data } = supabase.storage.from("avatars").getPublicUrl(path)
    return data.publicUrl
  }

  async function handleStepOne(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!firstName.trim()) {
      setError("Please enter your first name.")
      return
    }
    if (!signupTermsAccepted) {
      setError("Please accept the Terms of Service and Privacy Policy.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setError(null)
    setStep(2)
  }

  async function handleStepTwo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const redirectTo = `${window.location.origin}/auth/callback${
      requestedNext ? `?next=${encodeURIComponent(requestedNext)}` : ""
    }`
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          ui_intent: intent,
          phone: formatPhoneNumber(phone) || null,
        },
        emailRedirectTo: redirectTo,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    trackGaEvent("sign_up", {
      method: "email",
    })

    const userId = data.user?.id
    if (userId) {
      const avatarUrl = await uploadAvatar(userId)
      const profilePayload: Record<string, unknown> = {
        id: userId,
        full_name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ui_intent: intent,
        phone: formatPhoneNumber(phone) || null,
        phone_verified: false,
        profile_complete: false,
        avatar_url: avatarUrl,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        terms_version: LEGAL_VERSIONS.TERMS,
        privacy_version: LEGAL_VERSIONS.PRIVACY,
        newsletter_opted_in: signupNewsletterOptIn,
        newsletter_opted_in_at: signupNewsletterOptIn ? new Date().toISOString() : null,
        notification_preferences: {
          marketing_wellness_tips: signupNewsletterOptIn,
        },
      }
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" })
        if (!profileError) break
        const missingColumnMatch = profileError.message?.match(/'([^']+)' column/i)
        const missingColumn = missingColumnMatch?.[1]
        if (!missingColumn || !(missingColumn in profilePayload)) break
        delete profilePayload[missingColumn]
      }

      const refCookie = document.cookie.split("; ").find((c) => c.startsWith("thrml_ref="))
      const refCode = refCookie ? decodeURIComponent(refCookie.split("=").slice(1).join("=")) : null
      if (refCode && userId) {
        await fetch("/api/referral/record", {
          method: "POST",
          body: JSON.stringify({ userId, code: refCode }),
          headers: { "Content-Type": "application/json" },
        })
      }
    }

    setLoading(false)
    setStep(3)
    setResendCooldown(60)
  }

  async function handleResendVerification() {
    if (resendCooldown > 0) return
    setError(null)
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback${
          requestedNext ? `?next=${encodeURIComponent(requestedNext)}` : ""
        }`,
      },
    })
    if (resendError) {
      setError(resendError.message)
      return
    }
    setResendCooldown(60)
  }

  async function handleIConfirmed() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.email_confirmed_at) {
      router.push(getPostSignupDestination())
      router.refresh()
      return
    }
    setError("Email is not verified yet. Please click the link in your inbox.")
  }

  const strengthLabel = ["Weak", "Weak", "Okay", "Strong", "Very strong"][passwordScore]

  const baseCard = "rounded-xl border border-[#E7DED3] p-4 text-left transition"

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    // This handler remains for compatibility with auto-complete submit behavior.
    if (step === 1) return handleStepOne(event)
    if (step === 2) return handleStepTwo(event)
    event.preventDefault()
  }

  return (
    <AuthShell
      title={step === 3 ? "Check your inbox" : "Create your account"}
      subtitle={step === 3 ? "Confirm your email to finish signing up." : "One flow for guests and hosts."}
    >
      {step === 1 ? (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input
                placeholder="First"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input
                placeholder="Last"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-[#EFE6DC]">
                <div
                  className={cn(
                    "h-full transition-all",
                    passwordScore <= 1 && "bg-red-400",
                    passwordScore === 2 && "bg-amber-400",
                    passwordScore >= 3 && "bg-emerald-500"
                  )}
                  style={{ width: `${Math.max(20, passwordScore * 25)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Password strength: {strengthLabel}</p>
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2 pt-1">
            <label className="flex min-h-11 items-start gap-3 rounded-md">
              <Checkbox checked={signupTermsAccepted} onCheckedChange={(checked) => setSignupTermsAccepted(Boolean(checked))} />
              <span className="font-sans text-[13px] leading-5 text-[#1A1410]">
                I agree to thrml&apos;s{" "}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                  Privacy Policy
                </Link>
                <span className="ml-1 text-destructive">*</span>
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-3 rounded-md">
              <Checkbox
                checked={signupNewsletterOptIn}
                onCheckedChange={(checked) => setSignupNewsletterOptIn(Boolean(checked))}
              />
              <span className="font-sans text-[13px] leading-5 text-[#1A1410]">
                I&apos;d like to receive wellness news and updates from thrml
              </span>
            </label>
          </div>
          <Button className="btn-primary h-11 w-full" disabled={!signupTermsAccepted}>
            Continue
          </Button>
          <p className="type-label text-center md:text-left">
            Already have an account?{" "}
            <Link
              href={requestedNext ? `/login?next=${encodeURIComponent(requestedNext)}` : "/login"}
              className="text-brand-600"
            >
              Log in
            </Link>
          </p>
        </form>
      ) : null}

      {step === 2 ? (
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label>Profile photo</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#D8CCBF] p-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-[#F7F3EE]">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="Profile preview" className="size-10 rounded-full object-cover" />
                ) : (
                  <Camera className="size-4 text-[#746558]" />
                )}
              </div>
              <div className="text-sm">
                <p className="font-medium text-[#1A1410]">Add a photo</p>
                <p className="text-xs text-muted-foreground">Optional now, useful for trust later.</p>
              </div>
              <Input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setPhotoFile(file)
                  setPhotoPreview(file ? URL.createObjectURL(file) : null)
                }}
              />
            </label>
          </div>

          <div className="space-y-2">
            <Label>Phone number</Label>
            <Input
              type="tel"
              placeholder="Optional at signup"
              value={phone}
              onChange={(event) => setPhone(formatPhoneNumber(event.target.value))}
            />
            <p className="text-xs text-muted-foreground">You can add this later, but it is required before first booking or publishing.</p>
          </div>

          <div className="space-y-2">
            <Label>What brings you to thrml?</Label>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setIntent("guest")}
                className={cn(baseCard, intent === "guest" ? "border-[#C75B3A] bg-[#FFF5F0]" : "hover:bg-[#FAF8F4]")}
              >
                I want to book wellness spaces
              </button>
              <button
                type="button"
                onClick={() => setIntent("host")}
                className={cn(baseCard, intent === "host" ? "border-[#C75B3A] bg-[#FFF5F0]" : "hover:bg-[#FAF8F4]")}
              >
                I want to list my space
              </button>
              <button
                type="button"
                onClick={() => setIntent("both")}
                className={cn(baseCard, intent === "both" ? "border-[#C75B3A] bg-[#FFF5F0]" : "hover:bg-[#FAF8F4]")}
              >
                Both
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="btn-primary h-11 w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
          <button type="button" onClick={() => setStep(1)} className="w-full text-xs text-muted-foreground hover:underline">
            Back
          </button>
        </form>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 rounded-2xl border border-[#E7DED3] bg-[#FCFAF7] p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-[#FFF0E9] p-2">
              <Mail className="size-5 text-[#C75B3A]" />
            </div>
            <p className="text-sm text-[#1A1410]">We sent a verification link to <strong>{email}</strong>.</p>
          </div>

          <Button className="btn-primary w-full" onClick={handleIConfirmed}>
            <CheckCircle2 className="mr-2 size-4" />
            I&apos;ve verified my email
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleResendVerification} disabled={resendCooldown > 0}>
            {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend verification email"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : null}
    </AuthShell>
  )
}

export default function SignupClientPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading signup...</div>}>
      <SignupForm />
    </Suspense>
  )
}
