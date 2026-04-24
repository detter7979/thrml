import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components"
import * as React from "react"

export interface EmailProps {
  title?: string
  bodyText?: string
  ctaText?: string
  ctaUrl?: string
}

export const ThrmlTemplate = ({
  title = "Your session is confirmed",
  bodyText =
    "We're looking forward to hosting you. Please review the details below for your upcoming wellness session.",
  ctaText = "View Booking Status",
  ctaUrl = "https://usethrml.com/dashboard",
}: EmailProps) => (
  <Html>
    <Head />
    <Preview>{title}</Preview>
    <Body style={main}>
      <Container style={outer}>
        <Section style={card}>
          {/* Top color bar — terracotta → warm amber */}
          <Section style={accentBar} />

          <Section style={header}>
            <Text style={wordmark}>thrml</Text>
            <Text style={tagline}>Private wellness, by the hour</Text>
          </Section>

          <Section style={contentWrap}>
            <Section style={content}>
              <Text style={kicker}>Update</Text>
              <Text style={heading}>{title}</Text>
              <Text style={paragraph}>{bodyText}</Text>

              <Link href={ctaUrl} style={button}>
                {ctaText} →
              </Link>
            </Section>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              © 2026 thrml •{" "}
              <Link href="https://usethrml.com" style={footerLink}>
                usethrml.com
              </Link>
            </Text>
          </Section>
        </Section>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: "#FFFFFF",
  padding: "36px 16px",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const outer = { maxWidth: "580px", margin: "0 auto" }

const card = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E9DED4",
  borderRadius: "16px",
  overflow: "hidden" as const,
  boxShadow: "0 16px 48px rgba(26, 20, 16, 0.07)",
}

const accentBar = {
  height: "6px",
  backgroundColor: "#C4623A",
  background: "linear-gradient(90deg, #C4623A 0%, #D4A574 50%, #E8C9A8 100%)",
  margin: "0",
  padding: "0",
}

const header = {
  padding: "24px 28px 20px",
  backgroundColor: "#FFFFFF",
}

const wordmark = {
  margin: "0",
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
  fontSize: "28px",
  lineHeight: "1.15",
  fontWeight: "400",
  color: "#1A1410",
  letterSpacing: "-0.02em",
  textTransform: "lowercase" as const,
}

const tagline = {
  margin: "6px 0 0",
  fontSize: "13px",
  lineHeight: "1.4",
  color: "#8B6F5C",
  fontWeight: "500",
  letterSpacing: "0.02em",
}

const contentWrap = {
  padding: "0 24px 0 28px",
  backgroundColor: "#FFFFFF",
}

const content = {
  padding: "8px 0 32px 20px",
  borderLeft: "4px solid #C4623A",
  margin: "0",
}

const kicker = {
  margin: "0 0 10px",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "#C4623A",
}

const heading = {
  margin: "0 0 18px",
  fontSize: "28px",
  lineHeight: "1.25",
  fontWeight: "500",
  color: "#1A1410",
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
}

const paragraph = {
  margin: "0 0 8px",
  fontSize: "16px",
  lineHeight: "1.65",
  color: "#3E3329",
}

const button = {
  backgroundColor: "#C4623A",
  color: "#FFFFFF",
  padding: "14px 28px",
  borderRadius: "999px",
  textDecoration: "none",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: "700",
  marginTop: "22px",
  boxShadow: "0 4px 14px rgba(196, 98, 58, 0.35)",
}

const hr = {
  borderColor: "#E9DED4",
  borderStyle: "solid",
  borderWidth: "1px 0 0",
  margin: "0",
}

const footer = {
  textAlign: "left" as const,
  padding: "18px 28px 24px",
  backgroundColor: "#FFFFFF",
}

const footerText = {
  margin: "0",
  fontSize: "12px",
  lineHeight: "1.6",
  color: "#796A5E",
}

const footerLink = {
  color: "#C4623A",
  textDecoration: "underline",
}

export default ThrmlTemplate
