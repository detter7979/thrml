/** Plain-text sanitizer safe for Edge/Node serverless (no jsdom/DOMPurify). */

const BASIC_HTML_ENTITIES: [RegExp, string][] = [
  [/&amp;/gi, "&"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
  [/&apos;/gi, "'"],
  [/&nbsp;/gi, " "],
]

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, "")
}

function decodeBasicHtmlEntities(input: string): string {
  let text = input
  for (const [pattern, replacement] of BASIC_HTML_ENTITIES) {
    text = text.replace(pattern, replacement)
  }
  return text
}

export function sanitizeText(input: string): string {
  if (!input) return ""
  return decodeBasicHtmlEntities(stripHtmlTags(input)).trim()
}

const ALLOWED_HTML_TAG = /^(b|i|em|strong|p|br)$/i

/** Strips disallowed tags; keeps a small inline tag allowlist. Server-safe (no jsdom). */
export function sanitizeHtml(input: string): string {
  if (!input) return ""
  const withoutScripts = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
  const sanitized = withoutScripts.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag: string) => {
    return ALLOWED_HTML_TAG.test(tag) ? match.replace(/\s+[\w-]+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "") : ""
  })
  return decodeBasicHtmlEntities(sanitized).trim()
}
