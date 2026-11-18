"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { isNativeShell, onboardingComplete } from "@/lib/app-nav"
import {
  appPathFromUrl,
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

/**
 * Wires the iOS app's native pieces into the website (renders nothing):
 * - usethrml.com links opened from Mail, Messages, etc. open the right page in the app
 * - push: asks once after someone is signed in and past onboarding, registers the device, and
 *   opens the right page when a notification is tapped
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

  return null
}
