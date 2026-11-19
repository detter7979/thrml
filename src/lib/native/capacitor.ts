"use client"

import { isNativeShell } from "@/lib/app-nav"

/**
 * Thin access to the native plugins of the iOS app. The app loads usethrml.com in Capacitor,
 * which injects `window.Capacitor.Plugins` into the page, so the website calls the plugins the
 * native project installed without bundling Capacitor itself. Every helper returns null / false
 * when the plugin isn't there (plain browser, or an older app build), and callers fall back to the
 * web behaviour.
 */

type Listener = { remove: () => Promise<void> | void }
type PluginBase = { addListener?: (event: string, cb: (data: never) => void) => Promise<Listener> | Listener }

type CameraPlugin = {
  getPhoto: (options: Record<string, unknown>) => Promise<{ base64String?: string; format?: string }>
}
type SharePlugin = {
  share: (options: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown>
}
type PushPermission = "prompt" | "prompt-with-rationale" | "granted" | "denied"
export type PushPlugin = PluginBase & {
  checkPermissions: () => Promise<{ receive: PushPermission }>
  requestPermissions: () => Promise<{ receive: PushPermission }>
  register: () => Promise<void>
  removeAllDeliveredNotifications?: () => Promise<void>
}
export type AppPlugin = PluginBase & { getInfo?: () => Promise<{ version?: string; build?: string }> }

function plugins(): Record<string, unknown> | null {
  if (typeof window === "undefined" || !isNativeShell()) return null
  const cap = (window as Window & { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
  return cap?.Plugins ?? null
}

export function nativePlugin<T>(
  name: "Camera" | "Share" | "PushNotifications" | "App" | "AppTrackingTransparency"
): T | null {
  const plugin = plugins()?.[name]
  return plugin ? (plugin as T) : null
}

/** The public address of the site, even when the app serves pages from another origin. */
export const PUBLIC_ORIGIN = "https://usethrml.com"

/**
 * Opens the iOS share sheet. Uses the native Share plugin in the app and the Web Share API in
 * browsers that have it. Returns false when neither is available so callers can show their own
 * menu. A dismissed sheet still counts as handled.
 */
export async function shareNatively(options: { title?: string; text?: string; url: string }): Promise<boolean> {
  const share = nativePlugin<SharePlugin>("Share")
  if (share) {
    try {
      await share.share({ ...options, dialogTitle: options.title })
    } catch {
      // dismissed
    }
    return true
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(options)
    } catch {
      // dismissed
    }
    return true
  }
  return false
}

export function hasNativeShareSheet() {
  return nativePlugin<SharePlugin>("Share") !== null
}

/**
 * Asks iOS for a photo: the system sheet offers Take Photo or Choose from Library. Returns a File
 * ready for the normal upload path, null if the person cancelled, or undefined when the Camera
 * plugin isn't available (use the file input instead).
 */
export async function pickPhotoNatively(fileName = "photo"): Promise<File | null | undefined> {
  const camera = nativePlugin<CameraPlugin>("Camera")
  if (!camera) return undefined
  try {
    const photo = await camera.getPhoto({
      resultType: "base64",
      source: "PROMPT",
      quality: 85,
      width: 1200,
      correctOrientation: true,
      promptLabelHeader: "Profile photo",
      promptLabelPhoto: "Choose from Library",
      promptLabelPicture: "Take Photo",
    })
    if (!photo.base64String) return null
    // Decode here rather than fetch() a data: URL, which the site's content security policy blocks.
    const binary = atob(photo.base64String)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const format = (photo.format ?? "jpeg").toLowerCase()
    const type = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg"
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"
    return new File([bytes], `${fileName}.${ext}`, { type })
  } catch {
    // Cancelled, or camera/photos access was declined.
    return null
  }
}

/** Path inside the site for a usethrml.com link, or null for anything else. */
export function appPathFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  if (url.startsWith("/")) return url
  try {
    const parsed = new URL(url)
    if (parsed.hostname === "usethrml.com" || parsed.hostname.endsWith(".usethrml.com")) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/"
    }
  } catch {
    // not a URL
  }
  return null
}

const PUSH_TOKEN_KEY = "thrml.pushToken"

export function rememberPushToken(token: string) {
  try {
    window.localStorage.setItem(PUSH_TOKEN_KEY, token)
  } catch {
    // storage unavailable
  }
}

export function storedPushToken(): string | null {
  try {
    return window.localStorage.getItem(PUSH_TOKEN_KEY)
  } catch {
    return null
  }
}

/** Stop this phone getting the signed-in person's notifications. Call before signing out. */
export async function unregisterPushDevice() {
  const token = storedPushToken()
  if (!token) return
  try {
    await fetch("/api/push/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
  } catch {
    // best effort
  }
}

/**
 * App Tracking Transparency (capacitor-plugin-app-tracking-transparency). In the iOS app the
 * system "Allow tracking?" prompt replaces the cookie banner's Accept: ad and analytics tags only
 * run when the person allows tracking.
 */
export type TrackingStatus = "authorized" | "denied" | "notDetermined" | "restricted"
type TrackingPlugin = {
  getStatus: () => Promise<{ status: TrackingStatus }>
  requestPermission: () => Promise<{ status: TrackingStatus }>
}

export function hasTrackingPrompt() {
  return nativePlugin<TrackingPlugin>("AppTrackingTransparency") !== null
}

/** Current status without asking, or null outside the app. */
export async function trackingStatus(): Promise<TrackingStatus | null> {
  const att = nativePlugin<TrackingPlugin>("AppTrackingTransparency")
  if (!att) return null
  try {
    return (await att.getStatus()).status
  } catch {
    return null
  }
}

/** Shows the system prompt if iOS hasn't asked yet; otherwise returns the existing answer. */
export async function requestTracking(): Promise<TrackingStatus | null> {
  const att = nativePlugin<TrackingPlugin>("AppTrackingTransparency")
  if (!att) return null
  try {
    return (await att.requestPermission()).status
  } catch {
    return null
  }
}
