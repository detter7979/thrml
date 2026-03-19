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
    const observedTargets = new WeakSet<Element>()

    const observeTarget = (target: Element) => {
      if (observedTargets.has(target)) return
      observedTargets.add(target)
      observer.observe(target)
    }

    const collectTargets = (target: Element) => {
      if (target.matches(".reveal, .reveal-scale")) {
        observeTarget(target)
      }
      target.querySelectorAll(".reveal, .reveal-scale").forEach((child) => observeTarget(child))
    }

    collectTargets(el)

    // Watch for reveal nodes added after initial render (e.g. async listing cards).
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          collectTargets(node)
        })
      })
    })
    mutationObserver.observe(el, { childList: true, subtree: true })

    return () => {
      mutationObserver.disconnect()
      observer.disconnect()
    }
  }, [options])

  return ref
}
