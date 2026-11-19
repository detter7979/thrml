"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"

const SEEN_KEY = "thrml_hero_video_seen"

const SOURCES = {
  portrait: {
    webm: "/hero/walk-in-portrait.webm",
    mp4: "/hero/walk-in-portrait.mp4",
    start: "/hero/walk-in-start-portrait.jpg",
    end: "/hero/walk-in-end-portrait.jpg",
  },
  landscape: {
    webm: "/hero/walk-in-1080.webm",
    mp4: "/hero/walk-in-1080.mp4",
    start: "/hero/walk-in-start.jpg",
    end: "/hero/walk-in-end.jpg",
  },
} as const

type Mode = "pending" | "play" | "still"

const noopSubscribe = () => () => {}

let cachedSetup: string | null = null

/**
 * Snapshot of the client's setup, read once per page load (as a string so the
 * snapshot stays stable): marking the clip as seen must not swap it mid-view.
 */
function clientSetup(): string {
  if (cachedSetup) return cachedSetup
  cachedSetup = computeSetup()
  return cachedSetup
}

function computeSetup(): string {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const portrait = window.matchMedia("(max-width: 767px)").matches
  return `${reduce || readSeen() ? "still" : "play"}:${portrait ? "portrait" : "landscape"}`
}

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1")
  } catch {
    // Storage can be unavailable (private mode); replaying is fine.
  }
}

/**
 * Homepage hero background: the walk-in clip plays once and holds on its last
 * frame. Return visitors and anyone with reduced motion see the final still.
 * Phones get a portrait crop; wider screens get the 16:9 clip.
 */
export function HeroVideo() {
  const setup = useSyncExternalStore(noopSubscribe, clientSetup, () => "pending:portrait")
  const [failed, setFailed] = useState(false)
  const [ended, setEnded] = useState(false)
  const [initialMode, orientation] = setup.split(":")
  const mode: Mode = failed ? "still" : (initialMode as Mode)
  const portrait = orientation === "portrait"
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (mode !== "play") return
    const video = videoRef.current
    if (!video) return
    video.muted = true
    const attempt = video.play()
    if (attempt) attempt.catch(() => setFailed(true))
  }, [mode, portrait])

  const src = portrait ? SOURCES.portrait : SOURCES.landscape

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Plain CSS backgrounds so the right crop paints before hydration. */}
      <div className="absolute inset-0 bg-cover bg-center md:hidden" style={{ backgroundImage: `url(${SOURCES.portrait.start})` }} />
      <div className="absolute inset-0 hidden bg-cover bg-center md:block" style={{ backgroundImage: `url(${SOURCES.landscape.start})` }} />
      {/* Final frame for return visitors and reduced motion, faded in over the start frame. */}
      <div
        className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 md:hidden ${mode === "still" ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundImage: mode === "still" ? `url(${SOURCES.portrait.end})` : undefined }}
      />
      <div
        className={`absolute inset-0 hidden bg-cover bg-center transition-opacity duration-700 md:block ${mode === "still" ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundImage: mode === "still" ? `url(${SOURCES.landscape.end})` : undefined }}
      />
      {mode === "play" ? (
        <video
          key={portrait ? "portrait" : "landscape"}
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          poster={src.start}
          muted
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          onEnded={() => {
            markSeen()
            setEnded(true)
          }}
        >
          <source src={src.webm} type="video/webm" />
          <source src={src.mp4} type="video/mp4" />
        </video>
      ) : null}
      {/* Once the clip has played (or for the still), dim it slightly so the headline reads clearly. */}
      <div
        className={`absolute inset-0 bg-[#1A1410] transition-opacity duration-[1200ms] ease-out ${
          ended || mode === "still" ? "opacity-20" : "opacity-0"
        }`}
      />
    </div>
  )
}
