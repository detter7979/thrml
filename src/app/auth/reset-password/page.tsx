"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useState } from "react"
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react"

import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!isMounted) return
      setHasRecoverySession(Boolean(session))
      setIsCheckingSession(false)
    }

    void loadSession()

    return () => {
      isMounted = false
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || success) return

    setError(null)

    if (newPassword.length < 8) {
      setError("Password should be at least 8 characters.")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setIsSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })
    setIsSubmitting(false)

    if (updateError) {
      const message = updateError.message.toLowerCase()
      if (message.includes("at least 6 characters")) {
        setError("Password should be at least 8 characters.")
        return
      }
      if (message.includes("different from the old password")) {
        setError("New password should be different from old password.")
        return
      }
      setError(updateError.message)
      return
    }

    setSuccess(true)
    window.setTimeout(() => {
      router.push("/dashboard/account")
      router.refresh()
    }, 2000)
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a new password for your account.">
      {isCheckingSession ? (
        <div className="rounded-2xl border border-[#E7DED3] bg-[#FCFAF7] p-5 text-sm text-[#746558]">
          Checking your reset link...
        </div>
      ) : !hasRecoverySession ? (
        <div className="space-y-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5">
          <p className="text-sm text-[#991B1B]">
            This reset link has expired or already been used. Request a new one from your account settings.
          </p>
          <Link href="/dashboard/account" className="text-sm text-brand-600 hover:underline">
            Back to account settings
          </Link>
        </div>
      ) : success ? (
        <div className="space-y-3 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-[#166534]">
            <CheckCircle2 className="size-4" />
            Password updated successfully.
          </p>
          <p className="text-xs text-[#166534]">Redirecting to your account settings...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="new-password">New password</Label>
              <button
                type="button"
                onClick={() => setShowNewPassword((previous) => !previous)}
                className="inline-flex items-center gap-1 text-xs text-[#7A6A5D] hover:text-[#5D4E42]"
              >
                {showNewPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <button
                type="button"
                onClick={() => setShowConfirmPassword((previous) => !previous)}
                className="inline-flex items-center gap-1 text-xs text-[#7A6A5D] hover:text-[#5D4E42]"
              >
                {showConfirmPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button className="btn-primary h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
