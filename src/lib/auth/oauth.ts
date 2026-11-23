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
 * Sign in with Apple shows alongside Google. Until the Apple provider is switched on in Supabase
 * (after the Apple Developer account is set up), tapping it explains that it's almost ready
 * instead of sending people to an error page; once it's on, it works with no deploy.
 * Set NEXT_PUBLIC_APPLE_SIGNIN_ENABLED=false to hide the button entirely.
 */
export const APPLE_SIGN_IN_ENABLED = process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED !== "false"

export function enabledOAuthProviders(): OAuthProvider[] {
  return APPLE_SIGN_IN_ENABLED ? ["apple", "google"] : ["google"]
}

/** Error code when a provider isn't switched on in Supabase yet. */
export const PROVIDER_NOT_READY = "provider_not_ready"

let providerSettings: Promise<Record<string, boolean> | null> | null = null

/** Which sign-in providers are switched on in Supabase Auth (cached per page load). */
function loadProviderSettings() {
  providerSettings ??= fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload: { external?: Record<string, boolean> } | null) => payload?.external ?? null)
    .catch(() => null)
  return providerSettings
}

/** Friendly message for a provider that isn't switched on yet. */
export function providerNotReadyMessage(provider: OAuthProvider) {
  return `Sign in with ${OAUTH_PROVIDER_LABEL[provider]} is almost ready. Use Google or email for now.`
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
  if (provider === "apple") {
    const external = await loadProviderSettings()
    // Only block when Supabase clearly says it's off; if the check fails, try anyway.
    if (external && external.apple === false) return { ok: false, error: PROVIDER_NOT_READY }
  }

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
