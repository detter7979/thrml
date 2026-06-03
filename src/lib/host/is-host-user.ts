/** Matches dashboard shell: active listings or host/both ui_intent. */
export function isHostUser(input: {
  activeListingCount: number
  uiIntent?: string | null
}): boolean {
  const uiIntent = input.uiIntent
  return (
    input.activeListingCount > 0 || uiIntent === "host" || uiIntent === "both"
  )
}

export const HOST_NEW_LISTING_PATH = "/dashboard/host/new"
