/** Brief status after static/SVG output — drafts stay editable in Pending until approved. */
export function statusAfterStaticGeneration(approvedAt: string | null | undefined): "briefed" | "variations_ready" {
  return approvedAt ? "variations_ready" : "briefed"
}
