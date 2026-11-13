// gtag.js globals (previously typed via @next/third-parties).
export {}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}
