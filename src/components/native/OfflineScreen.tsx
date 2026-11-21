"use client"

import { useEffect, useState } from "react"

/**
 * The barrel sauna with its chimney steam drawn as a fading signal: the steam wisps rise like
 * Wi-Fi arcs, and the outer arc keeps losing its signal. Shared by the in-app offline screen and
 * the bundled offline page (docs/ios/offline.html), which copies this markup.
 */
export function OfflineSaunaArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="offline-glow" cx="50%" cy="62%" r="55%">
          <stop offset="0%" stopColor="#FFE8DC" />
          <stop offset="100%" stopColor="#F7F3EE" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="128" rx="112" ry="70" fill="url(#offline-glow)" />
      {/* Signal arcs made of steam */}
      <g fill="none" stroke="#C75B3A" strokeLinecap="round" className="offline-signal">
        <path d="M150 52 a10 10 0 0 1 14 0" strokeWidth="5" />
        <path d="M143 43 a20 20 0 0 1 28 0" strokeWidth="5" opacity="0.55" />
        <path d="M136 33 a30 30 0 0 1 42 0" strokeWidth="5" strokeDasharray="4 9" className="offline-signal-lost" />
      </g>
      {/* Steam wisps */}
      <g fill="none" stroke="#DDD4C8" strokeWidth="4" strokeLinecap="round">
        <path className="offline-wisp offline-wisp-1" d="M157 70 c-6 -8 6 -12 0 -20" />
        <path className="offline-wisp offline-wisp-2" d="M168 72 c-6 -8 6 -12 0 -20" />
      </g>
      {/* Chimney */}
      <rect x="154" y="70" width="16" height="22" rx="2" fill="#1A1410" />
      {/* Barrel */}
      <g>
        <rect x="44" y="88" width="152" height="74" rx="37" fill="#A8472B" />
        <rect x="50" y="94" width="140" height="62" rx="31" fill="#C75B3A" />
        {[66, 82, 98, 114, 130, 146, 162, 178].map((x) => (
          <line key={x} x1={x} y1="96" x2={x} y2="154" stroke="#A8472B" strokeWidth="2" opacity="0.55" />
        ))}
        <rect x="51" y="104" width="138" height="5" fill="#1A1410" opacity="0.8" />
        <rect x="48" y="141" width="144" height="5" fill="#1A1410" opacity="0.8" />
        {/* Door with a warm window */}
        <rect x="100" y="108" width="40" height="48" rx="6" fill="#7A3420" />
        <rect x="108" y="116" width="24" height="16" rx="3" fill="#FFB98F" className="offline-window" />
      </g>
      {/* Deck */}
      <rect x="28" y="160" width="184" height="8" rx="4" fill="#DDD4C8" />
      <style>{`
        .offline-wisp { animation: offline-rise 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center bottom; }
        .offline-wisp-2 { animation-delay: 1.6s; }
        .offline-signal-lost { animation: offline-flicker 2.4s steps(1) infinite; }
        .offline-window { animation: offline-ember 3.6s ease-in-out infinite; }
        @keyframes offline-rise { 0% { opacity: 0; transform: translateY(6px) scaleY(0.8); } 35% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px) scaleY(1.1); } }
        @keyframes offline-flicker { 0%, 60% { opacity: 0.35; } 61%, 70% { opacity: 0; } 71%, 100% { opacity: 0.2; } }
        @keyframes offline-ember { 0%, 100% { opacity: 1; } 50% { opacity: 0.78; } }
        @media (prefers-reduced-motion: reduce) { .offline-wisp, .offline-signal-lost, .offline-window { animation: none; } }
      `}</style>
    </svg>
  )
}

/**
 * Full-screen branded notice when the app loses its connection, instead of a blank page or a
 * browser error. Shows in the iOS app only; disappears by itself when the connection comes back.
 */
export function OfflineScreen() {
  // Only mounted on the client (inside the app), so reading navigator here is safe.
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false)
  const [backOnline, setBackOnline] = useState(false)
  const [stillOffline, setStillOffline] = useState(false)

  useEffect(() => {
    let toastTimer: number | undefined
    const goOffline = () => {
      setOffline(true)
      setBackOnline(false)
    }
    const goOnline = () => {
      setOffline(false)
      setStillOffline(false)
      setBackOnline(true)
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => setBackOnline(false), 2400)
    }
    window.addEventListener("offline", goOffline)
    window.addEventListener("online", goOnline)
    return () => {
      window.removeEventListener("offline", goOffline)
      window.removeEventListener("online", goOnline)
      window.clearTimeout(toastTimer)
    }
  }, [])

  function retry() {
    if (navigator.onLine) {
      window.location.reload()
      return
    }
    setStillOffline(true)
    window.setTimeout(() => setStillOffline(false), 2200)
  }

  return (
    <>
      {offline ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="offline-title"
          aria-describedby="offline-body"
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-[#F7F3EE] px-8 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center"
        >
          <OfflineSaunaArt className="w-[min(72vw,280px)]" />
          <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.22em] text-[#C75B3A]">You&apos;re offline</p>
          <h1 id="offline-title" className="mt-3 max-w-xs font-serif text-[32px] leading-[1.1] text-[#1A1410]">
            Lost the signal, not the heat.
          </h1>
          <p id="offline-body" className="mt-3 max-w-xs text-[15px] leading-6 text-[#7A6355]">
            Your bookings and messages are safe. Reconnect to Wi-Fi or cellular and we&apos;ll pick up right where
            you left off.
          </p>
          <button
            type="button"
            onClick={retry}
            className="btn-primary mt-8 h-12 w-full max-w-xs rounded-full text-base font-medium"
          >
            Try again
          </button>
          <p aria-live="polite" className="mt-3 h-5 text-sm text-[#7A6355]">
            {stillOffline ? "Still no connection. Give it a moment." : ""}
          </p>
          <p className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] font-serif text-xl text-[#1A1410]/40">
            thrml
          </p>
        </div>
      ) : null}
      {backOnline ? (
        <div
          role="status"
          className="fixed left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-[10000] -translate-x-1/2 rounded-full bg-[#1A1410] px-4 py-2 text-sm text-white shadow-lg"
        >
          Back online
        </div>
      ) : null}
    </>
  )
}
