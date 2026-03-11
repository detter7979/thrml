import DOMPurify from "isomorphic-dompurify"

export function sanitizeText(input: string): string {
  if (!input) return ""
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
}

export function sanitizeHtml(input: string): string {
  if (!input) return ""
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br"],
    ALLOWED_ATTR: [],
  }).trim()
}
