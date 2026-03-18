import { useEffect, useRef } from "react"

export function useScrollReveal<T extends HTMLElement = HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible")
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -40px 0px",
        ...options,
      }
    )

    const targets: Element[] = [...el.querySelectorAll(".reveal, .reveal-scale")]
    if (el.classList.contains("reveal") || el.classList.contains("reveal-scale")) {
      targets.push(el)
    }

    targets.forEach((target) => observer.observe(target))

    return () => observer.disconnect()
  }, [options])

  return ref
}
