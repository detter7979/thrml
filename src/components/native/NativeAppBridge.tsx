"use client"

import { useRouter } from "next/navigation"
import { useEffect, useSyncExternalStore } from "react"

import { OfflineScreen } from "@/components/native/OfflineScreen"

import { isNativeShell, onboardingComplete } from "@/lib/app-nav"
import {
  appPathFromUrl,
  closeInAppBrowser,
  hasInAppBrowser,
  isExternalWebUrl,
  nativeAuthReturnPath,
  openInAppBrowser,
  nativePlugin,
  rememberPushToken,
  storedPushToken,
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

const noopSubscribe = () => () => {}

/**
 * Wires the iOS app's native pieces into the website (renders nothing):
 * - usethrml.com links opened from Mail, Messages, etc. open the right page in the app
 * - links to other sites open in the in-app browser sheet instead of replacing the app
 * - a branded offline screen when the connection drops
 * - push: asks once after someone is signed in and past onboarding, registers the device, and
 *   opens the right page when a notification is tapped
 */
export function NativeAppBridge() {
  const router = useRouter()
  const inApp = useSyncExternalStore(noopSubscribe, isNativeShell, () => false)

  // Links to other sites (Instagram, Google Maps, Stripe docs, ...) open in the browser sheet, so
  // the app never turns into a general web browser. Same-site links and mailto:/tel: are untouched.
  useEffect(() => {
    if (!isNativeShell() || !hasInAppBrowser()) return
    const origin = window.location.origin
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute("download")) return
      const href = anchor.href
      if (!isExternalWebUrl(href, origin)) return
      event.preventDefault()
      void openInAppBrowser(href)
    }
    const originalOpen = window.open
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const href = url ? String(url) : ""
      if (href && isExternalWebUrl(href, origin)) {
        void openInAppBrowser(new URL(href, origin).toString())
        return null
      }
      return originalOpen.call(window, url, target, features)
    }) as typeof window.open
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.open = originalOpen
    }
  }, [])

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
          // Returning from Google / Apple sign-in in the browser sheet: close it and finish the
          // sign-in here, where the sign-in cookies live. A full load so the session is picked up.
          const authReturn = nativeAuthReturnPath(event.url)
          if (authReturn) {
            void closeInAppBrowser()
            window.location.assign(authReturn)
            return
          }
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

    void supabase.auth.getSession().then(({ data }) => {
      signedIn = Boolean(data.session)
      void enablePush(true)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      signedIn = Boolean(session)
      if (event === "SIGNED_IN") {
        const token = storedPushToken()
        if (token) void saveToken(token)
        void enablePush(true)
      }
    })
    cleanups.push(() => subscription.subscription.unsubscribe())

    return () => cleanups.forEach((cleanup) => cleanup())
  }, [router])

  return inApp ? <OfflineScreen /> : null
}
