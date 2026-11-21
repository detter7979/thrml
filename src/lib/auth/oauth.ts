"use client"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  NATIVE_AUTH_CALLBACK,
  nativePlugin,
  openInAppBrowser,
  type BrowserPlugin,
} from "@/lib/native/capacitor"

export type OAuthProvider = "google" | "apple"

export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
}

/**
 * Sign in with Apple stays hidden until the Apple Developer account is set up and the Apple
 * provider is configured in Supabase. Set NEXT_PUBLIC_APPLE_SIGNIN_ENABLED=true to show it.
 */
export const APPLE_SIGN_IN_ENABLED = process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED === "true"

export function enabledOAuthProviders(): OAuthProvider[] {
  return APPLE_SIGN_IN_ENABLED ? ["apple", "google"] : ["google"]
}

type StartResult = { ok: true } | { ok: false; error: string }

/**
 * Starts Google or Apple sign-in.
 *
 * In a browser this redirects to the provider and back to /auth/callback, as before.
 *
 * In the iOS app the provider page opens in a system browser sheet instead, because Google blocks
 * sign-in inside an app's embedded web view. The provider sends the person back to the app through
 * the app's URL scheme, and the app finishes the sign-in at /auth/callback in its own web view,
 * where the sign-in code verifier cookie lives. `onCancel` runs if they close the sheet.
 */
export async function startOAuthSignIn(
  supabase: SupabaseClient,
  provider: OAuthProvider,
  next: string,
  options: { onCancel?: () => void } = {}
): Promise<StartResult> {
  const nativeBrowser = nativePlugin<BrowserPlugin>("Browser")
  const query = `next=${encodeURIComponent(next)}`
  const redirectTo = nativeBrowser
    ? `${NATIVE_AUTH_CALLBACK}?${query}`
    : `${window.location.origin}/auth/callback?${query}`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Always show Google's account chooser so signing out and back in can switch accounts.
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  })

  if (error) return { ok: false, error: error.message }
  if (!data?.url) return { ok: false, error: "missing_url" }

  if (nativeBrowser) {
    if (options.onCancel && nativeBrowser.addListener) {
      const listener = await nativeBrowser.addListener("browserFinished", (() => {
        options.onCancel?.()
        void Promise.resolve(listener).then((l) => l?.remove?.())
      }) as never)
    }
    const opened = await openInAppBrowser(data.url)
    if (opened) return { ok: true }
  }

  window.location.href = data.url
  return { ok: true }
}
