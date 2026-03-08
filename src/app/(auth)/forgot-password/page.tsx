"use client"

import Link from "next/link"
import { type FormEvent, useState } from "react"

import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
    })

    setSent(true)
    setLoading(false)
    if (resetError) {
      setError("If an account exists for this email, you will receive a reset link.")
    }
  }

  return (
    <AuthShell title="Reset password" subtitle="We will send you a secure reset link.">
      {!sent ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
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
          <Button className="btn-primary h-11 w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset email"}
          </Button>
        </form>
      ) : (
        <div className="space-y-4 rounded-2xl border border-[#E7DED3] bg-[#FCFAF7] p-5">
          <p className="text-sm text-[#1A1410]">If an account exists for this email, you will receive a reset link.</p>
          <Link href="/login" className="text-sm text-brand-600 hover:underline">
            Back to login
          </Link>
        </div>
      )}
    </AuthShell>
  )
}
