import { checkPwnedPassword } from "@/lib/security/pwned-password"
import { MIN_PASSWORD_LENGTH, PWNED_PASSWORD_ERROR } from "@/lib/security/password-policy"

export { MIN_PASSWORD_LENGTH, PWNED_PASSWORD_ERROR } from "@/lib/security/password-policy"

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
