import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import * as React from "react"

/** Brand tokens (tailwind `brand` + `warm`) */
export const THRML_EMAIL_COLORS = {
  orange: "#C75B3A",
  orangeDark: "#B04E30",
  orangeLight: "#FFE8DC",
  cream: "#FFF5F0",
  warmBg: "#F7F3EE",
  ink: "#1A1410",
  body: "#3E3329",
  muted: "#7A6355",
  border: "#EDE8E2",
  white: "#FFFFFF",
} as const

export type SummaryRow = {
  label: string
  value: string
}

export type CreditHighlight = {
  headline: string
  subline?: string
}

export type ThrmlEmailLayoutProps = {
  preview: string
  /** Small caps label above the headline, e.g. "Booking confirmed" */
  kicker?: string
  title: string
  /** Opening line, e.g. "Hi Alex," */
  greeting?: string
  /** Plain paragraphs (already plain text; rendered as separate blocks) */
  paragraphs?: string[]
  /** Numbered list items (plain text) */
  listItems?: string[]
  summary?: SummaryRow[]
  creditHighlight?: CreditHighlight
  /** Raw HTML block (listing cards, ticket details, etc.) */
  contentHtml?: string
  children?: React.ReactNode
  cta?: { label: string; href: string }
  /** Muted note below CTA */
  footnote?: string
  /** Extra footer lines (unsubscribe, etc.) */
  footerExtra?: React.ReactNode
  appUrl?: string
}

function resolveAppUrl(appUrl?: string) {
  const base = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://usethrml.com").replace(/\/$/, "")
  return base
}

export function ThrmlEmailLayout({
  preview,
  kicker,
  title,
  greeting,
  paragraphs = [],
  listItems = [],
  summary,
  creditHighlight,
  contentHtml,
  children,
  cta,
  footnote,
  footerExtra,
  appUrl,
}: ThrmlEmailLayoutProps) {
  const base = resolveAppUrl(appUrl)
  const notificationsUrl = `${base}/dashboard/account#notifications`

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.outer}>
          <Section style={styles.card}>
            {/* Orange header band */}
            <Section style={styles.headerBand}>
              <Link href={base} style={styles.wordmarkLink}>
                <Text style={styles.wordmarkText}>thrml</Text>
              </Link>
              <Text style={styles.tagline}>Private wellness, by the hour</Text>
            </Section>

            {/* Main content */}
            <Section style={styles.content}>
              {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
              <Text style={styles.title}>{title}</Text>
              {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}

              {creditHighlight ? (
                <Section style={styles.creditBox}>
                  <Text style={styles.creditHeadline}>{creditHighlight.headline}</Text>
                  {creditHighlight.subline ? (
                    <Text style={styles.creditSubline}>{creditHighlight.subline}</Text>
                  ) : null}
                </Section>
              ) : null}

              {summary && summary.length > 0 ? (
                <Section style={styles.summaryBox}>
                  {summary.map((row, i) => (
                    <Section key={`${row.label}-${i}`} style={i < summary.length - 1 ? styles.summaryRow : styles.summaryRowLast}>
                      <Text style={styles.summaryLabel}>{row.label}</Text>
                      <Text style={styles.summaryValue}>{row.value}</Text>
                    </Section>
                  ))}
                </Section>
              ) : null}

              {listItems.map((item, i) => (
                <Text key={`list-${i}`} style={styles.listItem}>
                  {i + 1}. {item}
                </Text>
              ))}

              {paragraphs.map((p, i) => (
                <Text key={i} style={styles.paragraph}>
                  {p}
                </Text>
              ))}

              {children}

              {contentHtml ? <div dangerouslySetInnerHTML={{ __html: contentHtml }} /> : null}

              {cta ? (
                <Section style={styles.ctaWrap}>
                  <Button href={cta.href} style={styles.button}>
                    {cta.label}
                  </Button>
                </Section>
              ) : null}

              {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
            </Section>

            <Hr style={styles.hr} />

            <Section style={styles.footer}>
              <Text style={styles.footerText}>
                Thrml ·{" "}
                <Link href={base} style={styles.footerLink}>
                  usethrml.com
                </Link>
                {" · "}
                <Link href={`${base}/support`} style={styles.footerLink}>
                  Support
                </Link>
              </Text>
              <Text style={styles.footerMuted}>
                <Link href={notificationsUrl} style={styles.footerMutedLink}>
                  Manage notifications
                </Link>
                {" · "}
                <Link href="mailto:hello@usethrml.com" style={styles.footerMutedLink}>
                  hello@usethrml.com
                </Link>
              </Text>
              {footerExtra}
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: THRML_EMAIL_COLORS.cream,
    background: `linear-gradient(180deg, ${THRML_EMAIL_COLORS.orangeLight} 0%, ${THRML_EMAIL_COLORS.cream} 42%, ${THRML_EMAIL_COLORS.warmBg} 100%)`,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  outer: {
    maxWidth: "600px",
    width: "100%",
    margin: "0 auto",
  },
  card: {
    backgroundColor: THRML_EMAIL_COLORS.white,
    borderRadius: 0,
    overflow: "hidden" as const,
    border: "none",
  },
  headerBand: {
    backgroundColor: THRML_EMAIL_COLORS.orange,
    padding: "28px 28px 24px",
  },
  wordmarkLink: {
    display: "block",
    margin: "0 0 8px",
    textDecoration: "none",
  },
  wordmarkText: {
    margin: 0,
    fontFamily: 'Georgia, "Times New Roman", "DM Serif Display", serif',
    fontSize: "30px",
    lineHeight: "1.15",
    fontWeight: 400,
    color: "#F5EFE8",
    letterSpacing: "-0.025em",
    textTransform: "lowercase" as const,
  },
  tagline: {
    margin: 0,
    fontSize: "13px",
    lineHeight: "1.45",
    color: "rgba(255, 255, 255, 0.88)",
    fontWeight: 500,
    letterSpacing: "0.02em",
  },
  content: {
    padding: "28px 28px 8px",
    backgroundColor: THRML_EMAIL_COLORS.white,
  },
  kicker: {
    margin: "0 0 10px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: THRML_EMAIL_COLORS.orange,
  },
  title: {
    margin: "0 0 16px",
    fontFamily: 'Georgia, "Times New Roman", "DM Serif Display", serif',
    fontSize: "26px",
    lineHeight: "1.28",
    fontWeight: 400,
    color: THRML_EMAIL_COLORS.ink,
  },
  greeting: {
    margin: "0 0 18px",
    fontSize: "16px",
    lineHeight: "1.6",
    color: THRML_EMAIL_COLORS.body,
  },
  creditBox: {
    margin: "0 0 20px",
    padding: "20px 22px",
    backgroundColor: THRML_EMAIL_COLORS.cream,
    border: `1px solid ${THRML_EMAIL_COLORS.orangeLight}`,
    borderLeft: `4px solid ${THRML_EMAIL_COLORS.orange}`,
  },
  creditHeadline: {
    margin: "0 0 6px",
    fontFamily: 'Georgia, "Times New Roman", "DM Serif Display", serif',
    fontSize: "28px",
    lineHeight: "1.2",
    color: THRML_EMAIL_COLORS.ink,
  },
  creditSubline: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.55",
    color: THRML_EMAIL_COLORS.body,
  },
  summaryBox: {
    margin: "0 0 20px",
    padding: "18px 20px",
    backgroundColor: THRML_EMAIL_COLORS.cream,
    borderRadius: 0,
    border: `1px solid ${THRML_EMAIL_COLORS.orangeLight}`,
  },
  listItem: {
    margin: "0 0 10px",
    fontSize: "15px",
    lineHeight: "1.65",
    color: THRML_EMAIL_COLORS.body,
  },
  summaryRow: {
    marginBottom: "14px",
  },
  summaryRowLast: {
    marginBottom: 0,
  },
  summaryLabel: {
    margin: "0 0 4px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: THRML_EMAIL_COLORS.muted,
  },
  summaryValue: {
    margin: 0,
    fontSize: "15px",
    lineHeight: "1.5",
    color: THRML_EMAIL_COLORS.ink,
    fontWeight: 500,
  },
  paragraph: {
    margin: "0 0 14px",
    fontSize: "15px",
    lineHeight: "1.65",
    color: THRML_EMAIL_COLORS.body,
  },
  ctaWrap: {
    margin: "8px 0 4px",
  },
  button: {
    backgroundColor: THRML_EMAIL_COLORS.orange,
    color: THRML_EMAIL_COLORS.white,
    fontSize: "15px",
    fontWeight: 700,
    padding: "14px 28px",
    borderRadius: "999px",
    textDecoration: "none",
  },
  footnote: {
    margin: "18px 0 0",
    fontSize: "13px",
    lineHeight: "1.6",
    color: THRML_EMAIL_COLORS.muted,
  },
  hr: {
    borderColor: THRML_EMAIL_COLORS.border,
    borderWidth: "1px 0 0",
    margin: "0",
  },
  footer: {
    padding: "18px 28px 24px",
    backgroundColor: THRML_EMAIL_COLORS.cream,
  },
  footerText: {
    margin: "0 0 8px",
    fontSize: "12px",
    lineHeight: "1.6",
    color: THRML_EMAIL_COLORS.muted,
  },
  footerLink: {
    color: THRML_EMAIL_COLORS.orange,
    textDecoration: "underline",
  },
  footerMuted: {
    margin: 0,
    fontSize: "12px",
    lineHeight: "1.6",
    color: THRML_EMAIL_COLORS.muted,
  },
  footerMutedLink: {
    color: THRML_EMAIL_COLORS.muted,
    textDecoration: "underline",
  },
} as const

export default ThrmlEmailLayout
