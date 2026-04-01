"use client"

import { useEffect, useState } from "react"
import Script from "next/script"

type MetaUserData = {
  email?: string
  firstName?: string
  lastName?: string
  fbp?: string
  fbc?: string
}

type QueuedMetaEvent = {
  eventName: string
  params?: Record<string, unknown>
  eventId?: string
  /** Non-standard event names must use fbq("trackCustom", ...). */
  custom?: boolean
}

declare global {
  interface Window {
    fbq?: (...args: [string, string, Record<string, unknown>?, { eventID?: string }?]) => void
    __thrmlMetaQueue?: QueuedMetaEvent[]
  }
}

export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "922697217019242"
  const [consented, setConsented] = useState(false)

  useEffect(() => {
    const existing = localStorage.getItem("thrml_cookie_consent")
    if (existing === "accepted") setConsented(true)

    const handler = () => {
      const current = localStorage.getItem("thrml_cookie_consent")
      if (current === "accepted") setConsented(true)
    }

    window.addEventListener("storage", handler)
    const timer = setTimeout(handler, 1500)

    return () => {
      window.removeEventListener("storage", handler)
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!consented) return

    const interval = window.setInterval(() => {
      if (!window.fbq || !window.__thrmlMetaQueue?.length) return
      const queue = [...window.__thrmlMetaQueue]
      window.__thrmlMetaQueue = []
      queue.forEach(({ eventName, params, eventId, custom }) => {
        const eventIdOpt = eventId ? { eventID: eventId } : undefined
        if (custom) {
          window.fbq?.("trackCustom", eventName, params, eventIdOpt)
        } else {
          window.fbq?.("track", eventName, params, eventIdOpt)
        }
      })
    }, 300)

    return () => window.clearInterval(interval)
  }, [consented])

  if (!pixelId || !consented) return null

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `}
    </Script>
  )
}

function getCookieValue(cookieName: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${cookieName.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&")}=([^;]*)`)
  )
  return match ? decodeURIComponent(match[1]) : undefined
}

/** _fbp / _fbc for Meta CAPI payloads (browser only). */
export function getFacebookPixelCookies(): { fbp?: string; fbc?: string } {
  const fbp = getCookieValue("_fbp")
  const fbc = getCookieValue("_fbc")
  return {
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
  }
}

export function trackMetaEvent(
  eventName: string,
  params?: Record<string, unknown>,
  options?: {
    eventId?: string
    userData?: MetaUserData
    sendServer?: boolean
    custom?: boolean
  }
) {
  if (typeof window === "undefined") return

  const eventId =
    options?.eventId ?? (typeof params?.event_id === "string" ? (params.event_id as string) : undefined)
  const custom = Boolean(options?.custom)

  if (window.fbq) {
    const eventIdOpt = eventId ? { eventID: eventId } : undefined
    if (custom) {
      window.fbq("trackCustom", eventName, params, eventIdOpt)
    } else {
      window.fbq("track", eventName, params, eventIdOpt)
    }
  } else {
    window.__thrmlMetaQueue = window.__thrmlMetaQueue ?? []
    window.__thrmlMetaQueue.push({ eventName, params, eventId, custom })
  }

  if (options?.sendServer === false) return

  const userData: MetaUserData = {
    ...(options?.userData ?? {}),
    ...(getCookieValue("_fbp") ? { fbp: getCookieValue("_fbp") } : {}),
    ...(getCookieValue("_fbc") ? { fbc: getCookieValue("_fbc") } : {}),
  }

  void fetch("/api/meta/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      eventName,
      eventId,
      eventSourceUrl: window.location.href,
      customData: params ?? {},
      userData,
    }),
  }).catch(() => undefined)
}
