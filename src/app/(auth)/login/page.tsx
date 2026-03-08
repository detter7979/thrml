"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, type FormEvent, useState } from "react"
import { Chrome, Mail } from "lucide-react"

import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sanitizeNextPath } from "@/lib/security"
import { createClient } from "@/lib/supabase/client"

function LoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = sanitizeNextPath(searchParams.get("next"), "/")
  const loginError = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (isTemporarilyLocked()) {
      setError("If an account exists for this email, you will receive a reset link.")
      return
    }

    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      recordFailedAttempt()
      setError("If an account exists for this email, you will receive a reset link.")
      setLoading(false)
      return
    }

    clearFailedAttempts()
    router.push(next)
    router.refresh()
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
    setLoading(true)

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })

    if (oauthError) {
      setError(toProviderErrorMessage("Google", oauthError.message))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-4">
      {loginError === "invalid_reset_link" ? (
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          That reset link is invalid or has expired. Please request a new one.
        </div>
      ) : null}
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
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <div className="-mt-1 text-right">
        <Link href="/forgot-password" className="text-xs text-brand-600 hover:underline">
          Forgot password?
        </Link>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="btn-primary h-11 w-full" disabled={loading}>
        <Mail className="mr-2 size-4" />
        {loading ? "Signing in..." : "Continue"}
      </Button>
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <p className="text-xs uppercase tracking-wide text-muted-foreground">or</p>
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={handleGoogleLogin} disabled={loading}>
        <Chrome className="mr-2 size-4" />
        Continue with Google
      </Button>
      <p className="type-label text-center md:text-left">
        New to Thrml? <Link href="/signup" className="text-brand-600">Create an account</Link>
      </p>
    </form>
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
