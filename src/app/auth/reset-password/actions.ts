"use server"

import {
  MIN_PASSWORD_LENGTH,
  PWNED_PASSWORD_ERROR,
  validateSetPassword,
} from "@/lib/security/set-password"
import { createClient } from "@/lib/supabase/server"

export type UpdatePasswordResult = { ok: true } | { ok: false; error: string; field?: "password" }

export async function updatePassword(password: string): Promise<UpdatePasswordResult> {
  const validation = await validateSetPassword(password)
  if (!validation.ok) {
    return { ok: false, error: validation.error, field: "password" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: "Your reset link has expired or already been used." }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes("at least 6 characters")) {
      return {
        ok: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        field: "password",
      }
    }
    if (message.includes("different from the old password")) {
      return { ok: false, error: "New password should be different from old password." }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
