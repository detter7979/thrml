/** Strip internal editorial / engineering notes before publishing legal document bodies. */
export function sanitizeLegalBody(body: string, title?: string): string {
  let result = body

  result = result.replace(/\*\[(?:Placement requirement|EDITORIAL)[^\]]*\]\*/gi, "")
  result = result.replace(/\[ENGINEERING NOTE:[^\]]*\]/gi, "")
  result = result.replace(/(?:\n---\s*)+(?:\n\*+\s*)?$/g, "")
  result = result.replace(/\n\*+\s*$/g, "")

  const normalizedTitle = title?.trim().toLowerCase()
  const firstHeading = result.match(/^#\s+(.+)\n+/)
  if (
    firstHeading &&
    (!normalizedTitle || firstHeading[1].trim().toLowerCase() === normalizedTitle)
  ) {
    result = result.slice(firstHeading[0].length)
  }

  // Drop redundant subtitle block immediately after the title when present in CMS markdown.
  result = result.replace(
    /^(?:\*\*[^*\n]+\*\*\n|\*[^*\n]+\*\n|\*\*Version[^*\n]+\*\*\n)+/,
    ""
  )

  return result.trim()
}
