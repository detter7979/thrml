"use server"

import { validateSetPassword } from "@/lib/security/set-password"
import { createClient } from "@/lib/supabase/server"

export type SignUpWithPasswordResult =
  | { ok: true; userId: string | null }
  | { ok: false; error: string; field?: "password" }

type SignUpWithPasswordInput = {
  email: string
  password: string
  emailRedirectTo: string
  metadata: {
    full_name: string
    first_name: string
    last_name: string
    ui_intent: string
    phone: string | null
  }
}

export async function signUpWithPassword(
  input: SignUpWithPasswordInput
): Promise<SignUpWithPasswordResult> {
  const validation = await validateSetPassword(input.password)
  if (!validation.ok) {
    return { ok: false, error: validation.error, field: "password" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: input.metadata,
      emailRedirectTo: input.emailRedirectTo,
    },
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, userId: data.user?.id ?? null }
}
