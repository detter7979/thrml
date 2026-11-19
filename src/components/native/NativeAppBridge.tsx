"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { isNativeShell, ONBOARDING_COMPLETE_EVENT, onboardingComplete } from "@/lib/app-nav"
import { getCookieConsent, COOKIE_CONSENT_ACCEPTED, setConsentChoice } from "@/lib/cookie-consent"
import {
  appPathFromUrl,
  hasTrackingPrompt,
  nativePlugin,
  rememberPushToken,
  requestTracking,
  storedPushToken,
  trackingStatus,
  type AppPlugin,
  type PushPlugin,
} from "@/lib/native/capacitor"
import { createClient } from "@/lib/supabase/client"

const PUSH_ASKED_KEY = "thrml.pushAsked"

async function saveToken(token: string) {
  const app = nativePlugin<AppPlugin>("App")
  const info = await app?.getInfo?.().catch(() => undefined)
  await fetch("/api/push/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: "ios", appVersion: info?.version }),
  }).catch(() => undefined)
}

/**
 * Wires the iOS app's native pieces into the website (renders nothing):
 * - usethrml.com links opened from Mail, Messages, etc. open the right page in the app
 * - tracking: once onboarding is done, shows Apple's "Allow tracking?" prompt (instead of the cookie
 *   banner) and keeps the site's ad/analytics consent in step with that answer, including later
 *   changes in iOS Settings
 * - push: asks once after someone is signed in and past onboarding (after the tracking prompt, so
 *   two system prompts never stack), registers the device, and opens the right page on tap
 */
export function NativeAppBridge() {
  const router = useRouter()

  useEffect(() => {
    if (!isNativeShell()) return
    const cleanups: Array<() => void> = []
    const track = (listener: unknown) => {
      void Promise.resolve(listener).then((resolved) => {
        const remove = (resolved as { remove?: () => void } | undefined)?.remove
        if (remove) cleanups.push(() => void remove())
      })
    }

    const app = nativePlugin<AppPlugin>("App")
    if (app?.addListener) {
      track(
        app.addListener("appUrlOpen", ((event: { url?: string }) => {
          const path = appPathFromUrl(event.url)
          if (path) router.push(path)
        }) as never)
      )
    }

    const push = nativePlugin<PushPlugin>("PushNotifications")
    const supabase = createClient()
    let signedIn = false

    async function enablePush(allowPrompt: boolean) {
      if (!push || !signedIn) return
      const { receive } = await push.checkPermissions()
      if (receive === "granted") {
        await push.register()
        return
      }
      if (receive === "denied" || !allowPrompt || !onboardingComplete()) return
      try {
        if (window.localStorage.getItem(PUSH_ASKED_KEY) === "1") return
        window.localStorage.setItem(PUSH_ASKED_KEY, "1")
      } catch {
        // storage unavailable: still ask this once
      }
      const result = await push.requestPermissions()
      if (result.receive === "granted") await push.register()
    }

    if (push?.addListener) {
      track(
        push.addListener("registration", ((token: { value?: string }) => {
          if (!token.value) return
          rememberPushToken(token.value)
          if (signedIn) void saveToken(token.value)
        }) as never)
      )
      track(
        push.addListener("registrationError", ((error: unknown) => {
          console.error("[push] registration failed", error)
        }) as never)
      )
      track(
        push.addListener("pushNotificationActionPerformed", ((action: {
          notification?: { data?: { url?: string } }
        }) => {
          const path = appPathFromUrl(action.notification?.data?.url)
          if (path) router.push(path)
        }) as never)
      )
    }

    /** Ask for tracking once (after onboarding) and mirror the answer into cookie consent. */
    async function syncTracking() {
      if (!hasTrackingPrompt() || !onboardingComplete()) return
      const current = await trackingStatus()
      const status = current === "notDetermined" ? await requestTracking() : current
      if (!status || status === "notDetermined") return
      const allowed = status === "authorized"
      const stored = getCookieConsent()
      // Apply when unset, or when iOS now says no but the site still has a yes. A "yes" in iOS
      // doesn't override someone who declined in Cookie Settings.
      if (stored === null || (!allowed && stored === COOKIE_CONSENT_ACCEPTED)) setConsentChoice(allowed)
    }

    const ready = syncTracking().catch(() => undefined)

    void ready.then(() => supabase.auth.getSession()).then(({ data }) => {
      signedIn = Boolean(data.session)
      void enablePush(true)
    })

    function onOnboardingComplete() {
      void syncTracking()
        .catch(() => undefined)
        .then(() => enablePush(true))
    }
    window.addEventListener(ONBOARDING_COMPLETE_EVENT, onOnboardingComplete)
    cleanups.push(() => window.removeEventListener(ONBOARDING_COMPLETE_EVENT, onOnboardingComplete))
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      signedIn = Boolean(session)
      if (event === "SIGNED_IN") {
        const token = storedPushToken()
        if (token) void saveToken(token)
        void ready.then(() => enablePush(true))
      }
    })
    cleanups.push(() => subscription.subscription.unsubscribe())

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [router])

  return null
}
