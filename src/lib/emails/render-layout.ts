import { render } from "@react-email/render"

import ThrmlEmailLayout, {
  type CreditHighlight,
  type SummaryRow,
  type ThrmlEmailLayoutProps,
  THRML_EMAIL_COLORS,
} from "../../../emails/ThrmlEmailLayout"

export type { CreditHighlight, SummaryRow, ThrmlEmailLayoutProps }
export { THRML_EMAIL_COLORS }

export async function renderThrmlEmail(props: ThrmlEmailLayoutProps): Promise<string> {
  return render(ThrmlEmailLayout(props))
}

export function buildPlainText(props: ThrmlEmailLayoutProps): string {
  const lines: string[] = []

  if (props.title) lines.push(props.title)
  lines.push("")

  if (props.greeting) {
    lines.push(props.greeting)
    lines.push("")
  }

  if (props.creditHighlight) {
    lines.push(props.creditHighlight.headline)
    if (props.creditHighlight.subline) lines.push(props.creditHighlight.subline)
    lines.push("")
  }

  if (props.summary?.length) {
    for (const row of props.summary) {
      lines.push(`${row.label}: ${row.value}`)
    }
    lines.push("")
  }

  if (props.listItems?.length) {
    props.listItems.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
    lines.push("")
  }

  if (props.paragraphs?.length) {
    lines.push(...props.paragraphs)
    lines.push("")
  }

  if (props.cta) {
    lines.push(`${props.cta.label}: ${props.cta.href}`)
    lines.push("")
  }

  if (props.footnote) lines.push(props.footnote)

  return lines.join("\n").trim()
}

export async function renderThrmlEmailPair(props: ThrmlEmailLayoutProps): Promise<{ html: string; text: string }> {
  const html = await renderThrmlEmail(props)
  const text = buildPlainText(props)
  return { html, text }
}
