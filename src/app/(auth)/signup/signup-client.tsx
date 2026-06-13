"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Camera } from "lucide-react"
import { Suspense, type FormEvent, useEffect, useMemo, useState } from "react"

import { AuthField } from "@/components/auth/AuthField"
import {
  authPrimaryButtonClassName,
  authSocialButtonClassName,
} from "@/components/auth/auth-field-styles"
import { AuthShell } from "@/components/auth/AuthShell"
import { GoogleIcon } from "@/components/auth/GoogleIcon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { trackGaEvent } from "@/lib/analytics/ga"
import { LEGAL_VERSIONS } from "@/lib/legal-config"
import { sanitizeNextPath } from "@/lib/sanitize-next-path"
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

function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[#E7DED3]" />
      <span className="text-xs font-medium uppercase tracking-wide text-[#A89888]">or</span>
      <div className="h-px flex-1 bg-[#E7DED3]" />
    </div>
  )
}

function SignupStepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[#A89888]">
        <span>Step {step} of 2</span>
        <span>{step === 1 ? "Account details" : "Your profile"}</span>
      </div>
      <div className="flex gap-2">
        <div className={cn("h-1 flex-1 rounded-full", step >= 1 ? "bg-[#C75B3A]" : "bg-[#E7DED3]")} />
        <div className={cn("h-1 flex-1 rounded-full", step >= 2 ? "bg-[#C75B3A]" : "bg-[#E7DED3]")} />
      </div>
    </div>
  )
}

function SignupForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedNext = sanitizeNextPath(searchParams.get("next"), null)
  const nextQuery = requestedNext ? `?next=${encodeURIComponent(requestedNext)}` : ""

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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const passwordScore = useMemo(() => {
    let score = 0
    if (password.length >= 8) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    return score
  }, [password])
  const fullName = `${firstName} ${lastName}`.trim()
  const strengthLabel = ["Weak", "Weak", "Okay", "Strong", "Very strong"][passwordScore]
  const baseCard = "rounded-xl border border-[#E7DED3] p-4 text-left transition"
  const isBusy = loading || isGoogleLoading

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

  function toProviderErrorMessage(providerLabel: string, raw: string) {
    const normalized = raw.toLowerCase()
    if (
      normalized.includes("unsupported provider") ||
      normalized.includes("provider is not enabled")
    ) {
      return `${providerLabel} sign-up isn't enabled yet. Use email for now, or enable ${providerLabel} in Supabase Auth providers.`
    }
    return raw
  }

  async function handleGoogleSignup() {
    setError(null)
    if (!signupTermsAccepted) {
      setError("Please accept the Terms of Service and Privacy Policy.")
      return
    }

    setIsGoogleLoading(true)

    document.cookie = "thrml_signup_terms=1; path=/; max-age=600; SameSite=Lax"
    if (signupNewsletterOptIn) {
      document.cookie = "thrml_signup_newsletter=1; path=/; max-age=600; SameSite=Lax"
    } else {
      document.cookie = "thrml_signup_newsletter=; path=/; max-age=0; SameSite=Lax"
    }

    const next = getPostSignupDestination()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })

    if (oauthError) {
      setError(toProviderErrorMessage("Google", oauthError.message))
      setIsGoogleLoading(false)
      return
    }

    if (data.url) {
      trackGaEvent("sign_up", { method: "google" })
      window.location.href = data.url
      return
    }

    setError("Could not start Google sign-up. Please try again.")
    setIsGoogleLoading(false)
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

      void fetch("/api/legal/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: "terms_of_service", version: LEGAL_VERSIONS.TERMS }),
      })

      fetch("/api/events/user-registered", { method: "POST" }).catch(() => {})
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

  return (
    <div className="space-y-6">
      {step === 3 ? (
        <div className="space-y-4 rounded-2xl border border-[#E7DED3] bg-[#FCFAF7] p-5">
          <h2 className="font-serif text-xl text-[#1A1410]">Check your inbox</h2>
          <p className="text-sm leading-relaxed text-[#746558]">
            We sent a verification link to <strong className="text-[#1A1410]">{email}</strong>. Open
            it on this device to finish creating your account.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-full border-[#E7DED3]"
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
            </Button>
            <Button type="button" className={cn(authPrimaryButtonClassName, "flex-1")} onClick={handleIConfirmed}>
              I&apos;ve verified my email
            </Button>
          </div>
        </div>
      ) : step === 1 ? (
        <div className="space-y-5">
          <SignupStepIndicator step={1} />

          <form onSubmit={handleStepOne} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <AuthField
                label="First name"
                placeholder="First"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                required
              />
              <AuthField
                label="Last name"
                placeholder="Last"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
            <AuthField
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <div className="space-y-2">
              <AuthField
                label="Password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
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
                <p className="text-xs text-[#A89888]">Password strength: {strengthLabel}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex min-h-11 items-start gap-3 rounded-md">
                <Checkbox
                  checked={signupTermsAccepted}
                  onCheckedChange={(checked) => setSignupTermsAccepted(Boolean(checked))}
                />
                <span className="text-[13px] leading-5 text-[#1A1410]">
                  I agree to thrml&apos;s{" "}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#C75B3A] hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#C75B3A] hover:underline">
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
                <span className="text-[13px] leading-5 text-[#746558]">
                  I&apos;d like to receive wellness news and updates from thrml
                </span>
              </label>
            </div>

            <Button className={authPrimaryButtonClassName} disabled={!signupTermsAccepted || isBusy}>
              Continue
            </Button>
          </form>

          <AuthDivider />

          <Button
            type="button"
            variant="outline"
            className={authSocialButtonClassName}
            onClick={handleGoogleSignup}
            disabled={!signupTermsAccepted || isBusy}
          >
            <GoogleIcon className="size-5 shrink-0" />
            {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
          </Button>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      ) : (
        <div className="space-y-5">
          <SignupStepIndicator step={2} />

          <form onSubmit={handleStepTwo} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1A1410]">Profile photo</Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#D8CCBF] bg-white p-3 transition hover:bg-[#FCFAF7]">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F7F3EE]">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="Profile preview" className="size-10 rounded-full object-cover" />
                  ) : (
                    <Camera className="size-4 text-[#746558]" />
                  )}
                </div>
                <div className="text-sm">
                  <p className="font-medium text-[#1A1410]">Add a photo</p>
                  <p className="text-xs text-[#A89888]">Optional now, useful for trust later.</p>
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

            <AuthField
              label="Phone number"
              type="tel"
              placeholder="Optional at signup"
              value={phone}
              onChange={(event) => setPhone(formatPhoneNumber(event.target.value))}
            />
            <p className="-mt-3 text-xs text-[#A89888]">
              You can add this later, but it is required before your first booking or listing.
            </p>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#1A1410]">What brings you to thrml?</Label>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setIntent("guest")}
                  className={cn(
                    baseCard,
                    intent === "guest" ? "border-[#C75B3A] bg-[#FFF5F0]" : "hover:bg-[#FAF8F4]"
                  )}
                >
                  <span className="text-sm font-medium text-[#1A1410]">I want to book wellness spaces</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIntent("host")}
                  className={cn(
                    baseCard,
                    intent === "host" ? "border-[#C75B3A] bg-[#FFF5F0]" : "hover:bg-[#FAF8F4]"
                  )}
                >
                  <span className="text-sm font-medium text-[#1A1410]">I want to list my space</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIntent("both")}
                  className={cn(
                    baseCard,
                    intent === "both" ? "border-[#C75B3A] bg-[#FFF5F0]" : "hover:bg-[#FAF8F4]"
                  )}
                >
                  <span className="text-sm font-medium text-[#1A1410]">Both — book and list</span>
                </button>
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className={authPrimaryButtonClassName} disabled={isBusy}>
              {loading ? "Creating account..." : "Create account"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(1)
              }}
              className="w-full text-sm text-[#746558] hover:text-[#1A1410] hover:underline"
            >
              Back to account details
            </button>
          </form>
        </div>
      )}

      {step !== 3 ? (
        <p className="text-center text-sm text-[#746558] md:text-left">
          Already have an account?{" "}
          <Link href={`/login${nextQuery}`} className="font-medium text-[#C75B3A] hover:underline">
            Log in
          </Link>
        </p>
      ) : null}
    </div>
  )
}

export default function SignupClientPage() {
  return (
    <AuthShell title="Create your account" subtitle="Join thrml to book or list wellness spaces.">
      <Suspense fallback={<div className="text-sm text-[#746558]">Loading signup...</div>}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  )
}
