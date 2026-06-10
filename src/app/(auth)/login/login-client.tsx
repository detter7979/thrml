"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, type FormEvent, useState } from "react"

import { AuthField } from "@/components/auth/AuthField"
import {
  authPrimaryButtonClassName,
  authSocialButtonClassName,
} from "@/components/auth/auth-field-styles"
import { AuthShell } from "@/components/auth/AuthShell"
import { GoogleIcon } from "@/components/auth/GoogleIcon"
import { Button } from "@/components/ui/button"
import { trackGaEvent } from "@/lib/analytics/ga"
import { sanitizeNextPath } from "@/lib/sanitize-next-path"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type LoginView = "password" | "magic-link" | "check-email"

function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[#E7DED3]" />
      <span className="text-xs font-medium uppercase tracking-wide text-[#A89888]">or</span>
      <div className="h-px flex-1 bg-[#E7DED3]" />
    </div>
  )
}

function MethodToggle({
  view,
  onChange,
  disabled,
}: {
  view: "password" | "magic-link"
  onChange: (view: "password" | "magic-link") => void
  disabled: boolean
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-full border border-[#E7DED3] bg-[#F7F3EE] p-1"
      role="tablist"
      aria-label="Sign-in method"
    >
      {(
        [
          { id: "password" as const, label: "Password" },
          { id: "magic-link" as const, label: "Email link" },
        ] as const
      ).map((option) => {
        const active = view === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-10 rounded-full text-sm font-medium transition-colors",
              active
                ? "bg-white text-[#1A1410] shadow-sm"
                : "text-[#746558] hover:text-[#1A1410]"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function LoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedNext = sanitizeNextPath(searchParams.get("next"), null)
  const loginError = searchParams.get("error")
  const loginMessage = searchParams.get("message")
  const nextQuery = requestedNext ? `?next=${encodeURIComponent(requestedNext)}` : ""

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [view, setView] = useState<LoginView>("password")
  const [error, setError] = useState<string | null>(null)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  function isTemporarilyLocked() {
    if (typeof window === "undefined") return false
    const raw = window.localStorage.getItem("auth:login-attempts")
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw) as { count: number; resetAt: number }
      if (Date.now() > parsed.resetAt) {
        window.localStorage.removeItem("auth:login-attempts")
        return false
      }
      return parsed.count >= 8
    } catch {
      return false
    }
  }

  function recordFailedAttempt() {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem("auth:login-attempts")
    const now = Date.now()
    let count = 1
    let resetAt = now + 10 * 60 * 1000
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { count: number; resetAt: number }
        if (now <= parsed.resetAt) {
          count = parsed.count + 1
          resetAt = parsed.resetAt
        }
      } catch {
        // Ignore malformed local state and reset window.
      }
    }
    window.localStorage.setItem("auth:login-attempts", JSON.stringify({ count, resetAt }))
  }

  function clearFailedAttempts() {
    if (typeof window === "undefined") return
    window.localStorage.removeItem("auth:login-attempts")
  }

  function resolveNextPath() {
    if (requestedNext) return requestedNext
    if (typeof window === "undefined") return "/"

    const referrer = document.referrer
    if (!referrer) return "/"

    try {
      const referrerUrl = new URL(referrer)
      if (referrerUrl.origin !== window.location.origin) return "/"
      const candidate = sanitizeNextPath(`${referrerUrl.pathname}${referrerUrl.search}`, "/")
      if (
        candidate.startsWith("/login") ||
        candidate.startsWith("/signup") ||
        candidate.startsWith("/forgot-password") ||
        candidate.startsWith("/auth/")
      ) {
        return "/"
      }
      return candidate
    } catch {
      return "/"
    }
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (isTemporarilyLocked()) {
      setError("If an account exists for this email, you will receive a reset link.")
      return
    }

    setIsPasswordLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      recordFailedAttempt()
      setError("If an account exists for this email, you will receive a reset link.")
      setIsPasswordLoading(false)
      return
    }

    clearFailedAttempts()
    trackGaEvent("login", {
      method: "email",
    })
    router.push(resolveNextPath())
    router.refresh()
  }

  async function handleMagicLinkLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError("Please enter your email address.")
      return
    }

    setIsMagicLinkLoading(true)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || window.location.origin
    const magicLinkNext = requestedNext ?? "/dashboard"
    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${appUrl}/auth/confirm?next=${encodeURIComponent(magicLinkNext)}`,
      },
    })

    setIsMagicLinkLoading(false)
    if (magicLinkError) {
      setError(magicLinkError.message)
      return
    }

    setView("check-email")
    trackGaEvent("login", {
      method: "magic_link",
    })
  }

  function toProviderErrorMessage(providerLabel: string, raw: string) {
    const normalized = raw.toLowerCase()
    if (
      normalized.includes("unsupported provider") ||
      normalized.includes("provider is not enabled")
    ) {
      return `${providerLabel} sign-in isn't enabled yet. Use email/password for now, or enable ${providerLabel} in Supabase Auth providers.`
    }
    return raw
  }

  async function handleGoogleLogin() {
    setError(null)
    setIsGoogleLoading(true)

    const next = resolveNextPath()
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
      window.location.href = data.url
      return
    }

    setError("Could not start Google sign-in. Please try again.")
    setIsGoogleLoading(false)
  }

  const isBusy = isPasswordLoading || isMagicLinkLoading || isGoogleLoading

  return (
    <div className="space-y-6">
      {loginError === "invalid_reset_link" ? (
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          That reset link is invalid or has expired. Please request a new one.
        </div>
      ) : null}
      {loginMessage === "please_sign_in" ? (
        <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1E3A8A]">
          Please sign in to continue.
        </div>
      ) : null}
      {loginMessage === "account_suspended" ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          This account has been suspended. Contact{" "}
          <a href="mailto:hello@usethrml.com" className="font-medium underline">
            hello@usethrml.com
          </a>{" "}
          if you believe this is a mistake.
        </div>
      ) : null}

      {view === "check-email" ? (
        <div className="space-y-4 rounded-2xl border border-[#E7DED3] bg-[#FCFAF7] p-5">
          <h2 className="font-serif text-xl text-[#1A1410]">Check your inbox</h2>
          <p className="text-sm leading-relaxed text-[#746558]">
            We sent a login link to <strong className="text-[#1A1410]">{email}</strong>. Open it on
            this device to sign in.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-full border-[#E7DED3]"
              onClick={() => setView("magic-link")}
            >
              Send another link
            </Button>
            <Button
              type="button"
              className={cn(authPrimaryButtonClassName, "flex-1")}
              onClick={() => setView("password")}
            >
              Use password
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <MethodToggle
            view={view === "magic-link" ? "magic-link" : "password"}
            onChange={(next) => setView(next)}
            disabled={isBusy}
          />

          {view === "password" ? (
            <form onSubmit={handlePasswordLogin} className="space-y-5">
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <div className="flex justify-end">
                  <Link
                    href={`/forgot-password${nextQuery}`}
                    className="text-sm text-[#C75B3A] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
              <Button className={authPrimaryButtonClassName} disabled={isBusy}>
                {isPasswordLoading ? "Signing in..." : "Log in"}
              </Button>
            </form>
          ) : null}

          {view === "magic-link" ? (
            <form onSubmit={handleMagicLinkLogin} className="space-y-5">
              <AuthField
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <p className="text-sm leading-relaxed text-[#746558]">
                We&apos;ll email you a secure link — no password needed.
              </p>
              <Button className={authPrimaryButtonClassName} disabled={isBusy}>
                {isMagicLinkLoading ? "Sending link..." : "Email me a login link"}
              </Button>
            </form>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      )}

      {view !== "check-email" ? (
        <>
          <AuthDivider />

          <Button
            type="button"
            variant="outline"
            className={authSocialButtonClassName}
            onClick={handleGoogleLogin}
            disabled={isBusy}
          >
            <GoogleIcon className="size-5 shrink-0" />
            {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
          </Button>
        </>
      ) : null}

      <p className="text-center text-sm text-[#746558] md:text-left">
        New to thrml?{" "}
        <Link href={`/signup${nextQuery}`} className="font-medium text-[#C75B3A] hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export default function LoginClientPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to book or manage your wellness space.">
      <Suspense fallback={<div className="text-sm text-[#746558]">Loading login...</div>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
