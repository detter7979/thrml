import { checkPwnedPassword } from "@/lib/security/pwned-password"

export const MIN_PASSWORD_LENGTH = 10

export const PWNED_PASSWORD_ERROR =
  "This password appeared in a known data breach. Please choose a different one."

export type SetPasswordValidationResult = { ok: true } | { ok: false; error: string }

export async function validateSetPassword(password: string): Promise<SetPasswordValidationResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }

  const result = await checkPwnedPassword(password)
  if (result.pwned) {
    return { ok: false, error: PWNED_PASSWORD_ERROR }
  }

  return { ok: true }
}
