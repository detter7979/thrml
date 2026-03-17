"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, type FormEvent, useState } from "react"
import { Chrome, Mail } from "lucide-react"

import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sanitizeNextPath } from "@/lib/sanitize-next-path"
import { trackGaEvent } from "@/lib/analytics/ga"
import { createClient } from "@/lib/supabase/client"

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
  const [view, setView] = useState<"password" | "magic-link" | "check-email">("password")
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
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })

    if (oauthError) {
      setError(toProviderErrorMessage("Google", oauthError.message))
      setIsGoogleLoading(false)
    }
  }

  const isBusy = isPasswordLoading || isMagicLinkLoading || isGoogleLoading

  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={view === "password" ? "default" : "outline"}
          className={view === "password" ? "btn-primary h-10" : "h-10"}
          onClick={() => setView("password")}
          disabled={isBusy}
        >
          Password
        </Button>
        <Button
          type="button"
          variant={view === "magic-link" ? "default" : "outline"}
          className={view === "magic-link" ? "btn-primary h-10" : "h-10"}
          onClick={() => setView("magic-link")}
          disabled={isBusy}
        >
          Email link
        </Button>
      </div>

      {view === "check-email" ? (
        <div className="space-y-4 rounded-2xl border border-[#E7DED3] bg-[#FCFAF7] p-5">
          <h2 className="text-base font-medium text-[#1A1410]">Check your inbox</h2>
          <p className="text-sm text-[#746558]">
            We sent a login link to <strong>{email}</strong>. Click it to sign in without a password.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setView("magic-link")}>
              Send another link
            </Button>
            <Button type="button" className="btn-primary flex-1" onClick={() => setView("password")}>
              Use password
            </Button>
          </div>
        </div>
      ) : null}

      {view === "password" ? (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <div className="-mt-1 text-right">
            <Link href={`/forgot-password${nextQuery}`} className="text-xs text-brand-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="btn-primary h-11 w-full" disabled={isBusy}>
            <Mail className="mr-2 size-4" />
            {isPasswordLoading ? "Signing in..." : "Continue"}
          </Button>
        </form>
      ) : null}

      {view === "magic-link" ? (
        <form onSubmit={handleMagicLinkLogin} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="btn-primary h-11 w-full" disabled={isBusy}>
            <Mail className="mr-2 size-4" />
            {isMagicLinkLoading ? "Sending..." : "Send magic link"}
          </Button>
        </form>
      ) : null}

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <p className="text-xs uppercase tracking-wide text-muted-foreground">or</p>
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={handleGoogleLogin} disabled={isBusy}>
        <Chrome className="mr-2 size-4" />
        {isGoogleLoading ? "Redirecting..." : "Continue with Google"}
      </Button>
      <p className="type-label text-center md:text-left">
        New to thrml? <Link href={`/signup${nextQuery}`} className="text-brand-600">Create an account</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="One account for booking and listing wellness spaces.">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading login...</div>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
