import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components"
import * as React from "react"

export interface CreditBannerProps {
  headline: string
  subline?: string
}

export interface EmailProps {
  title?: string
  bodyText?: string
  ctaText?: string
  ctaUrl?: string
  /** Highlighted strip for credit / balance callouts */
  creditBanner?: CreditBannerProps
  /** Dark editorial layout (#121212, terracotta #B36B4D) */
  editorial?: boolean
}

export const ThrmlTemplate = ({
  title = "Your session is confirmed",
  bodyText =
    "We're looking forward to hosting you. Please review the details below for your upcoming wellness session.",
  ctaText = "View Booking Status",
  ctaUrl = "https://usethrml.com/dashboard",
  creditBanner,
  editorial = false,
}: EmailProps) => {
  const shell = editorial ? editorialMain : main
  const cardStyle = editorial ? editorialCard : card
  const headerStyle = editorial ? editorialHeader : header
  const wordmarkStyle = editorial ? editorialWordmark : wordmark
  const taglineStyle = editorial ? editorialTagline : tagline
  const contentWrapStyle = editorial ? editorialContentWrap : contentWrap
  const contentStyle = editorial ? editorialContent : content
  const kickerStyle = editorial ? editorialKicker : kicker
  const headingStyle = editorial ? editorialHeading : heading
  const paragraphStyle = editorial ? editorialParagraph : paragraph
  const buttonStyle = editorial ? editorialButton : button
  const hrStyle = editorial ? editorialHr : hr
  const footerStyle = editorial ? editorialFooter : footer
  const footerTextStyle = editorial ? editorialFooterText : footerText
  const footerLinkStyle = editorial ? editorialFooterLink : footerLink
  const accentBarStyle = editorial ? editorialAccentBar : accentBar

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={shell}>
        <Container style={outer}>
          <Section style={cardStyle}>
            <Section style={accentBarStyle} />

            <Section style={headerStyle}>
              <Text style={wordmarkStyle}>thrml</Text>
              <Text style={taglineStyle}>Private wellness, by the hour</Text>
            </Section>

            <Section style={contentWrapStyle}>
              {creditBanner ? (
                <Section style={editorial ? editorialCreditBanner : creditBannerBox}>
                  <Text style={editorial ? editorialCreditHeadline : creditBannerHeadline}>
                    {creditBanner.headline}
                  </Text>
                  {creditBanner.subline ? (
                    <Text style={editorial ? editorialCreditSub : creditBannerSub}>{creditBanner.subline}</Text>
                  ) : null}
                </Section>
              ) : null}

              <Section style={contentStyle}>
                <Text style={kickerStyle}>Update</Text>
                <Text style={headingStyle}>{title}</Text>
                <Text style={paragraphStyle}>{bodyText}</Text>

                <Link href={ctaUrl} style={buttonStyle}>
                  {ctaText} →
                </Link>
              </Section>
            </Section>

            <Hr style={hrStyle} />

            <Section style={footerStyle}>
              <Text style={footerTextStyle}>
                © 2026 thrml •{" "}
                <Link href="https://usethrml.com" style={footerLinkStyle}>
                  usethrml.com
                </Link>
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: "#FFFFFF",
  padding: "36px 16px",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const editorialMain = {
  ...main,
  backgroundColor: "#121212",
}

const outer = { maxWidth: "580px", margin: "0 auto" }

const card = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E9DED4",
  borderRadius: "16px",
  overflow: "hidden" as const,
  boxShadow: "0 16px 48px rgba(26, 20, 16, 0.07)",
}

const editorialCard = {
  backgroundColor: "#1A1A1A",
  border: "1px solid #2C2C2C",
  borderRadius: "16px",
  overflow: "hidden" as const,
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.45)",
}

const accentBar = {
  height: "6px",
  backgroundColor: "#C4623A",
  background: "linear-gradient(90deg, #C4623A 0%, #D4A574 50%, #E8C9A8 100%)",
  margin: "0",
  padding: "0",
}

const editorialAccentBar = {
  ...accentBar,
  background: "linear-gradient(90deg, #B36B4D 0%, #C4623A 50%, #D4A574 100%)",
}

const header = {
  padding: "24px 28px 20px",
  backgroundColor: "#FFFFFF",
}

const editorialHeader = {
  ...header,
  backgroundColor: "#1A1A1A",
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

const editorialWordmark = {
  ...wordmark,
  color: "#F5F0EB",
}

const tagline = {
  margin: "6px 0 0",
  fontSize: "13px",
  lineHeight: "1.4",
  color: "#8B6F5C",
  fontWeight: "500",
  letterSpacing: "0.02em",
}

const editorialTagline = {
  ...tagline,
  color: "#A89888",
}

const contentWrap = {
  padding: "0 24px 0 28px",
  backgroundColor: "#FFFFFF",
}

const editorialContentWrap = {
  ...contentWrap,
  backgroundColor: "#1A1A1A",
}

const creditBannerBox = {
  margin: "0 0 20px",
  padding: "16px 18px",
  backgroundColor: "#FDF8F4",
  borderRadius: "12px",
  borderLeft: "4px solid #C4623A",
}

const editorialCreditBanner = {
  margin: "0 0 20px",
  padding: "18px 20px",
  backgroundColor: "#121212",
  borderRadius: "12px",
  borderLeft: "4px solid #B36B4D",
}

const creditBannerHeadline = {
  margin: "0 0 6px",
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
  fontSize: "22px",
  lineHeight: "1.3",
  color: "#1A1410",
  fontWeight: "500",
}

const editorialCreditHeadline = {
  ...creditBannerHeadline,
  color: "#F5F0EB",
}

const creditBannerSub = {
  margin: "0",
  fontSize: "14px",
  lineHeight: "1.55",
  color: "#5C4D42",
}

const editorialCreditSub = {
  ...creditBannerSub,
  color: "#C4B5A8",
}

const content = {
  padding: "8px 0 32px 20px",
  borderLeft: "4px solid #C4623A",
  margin: "0",
}

const editorialContent = {
  ...content,
  borderLeftColor: "#B36B4D",
}

const kicker = {
  margin: "0 0 10px",
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "#C4623A",
}

const editorialKicker = {
  ...kicker,
  color: "#B36B4D",
}

const heading = {
  margin: "0 0 18px",
  fontSize: "28px",
  lineHeight: "1.25",
  fontWeight: "500",
  color: "#1A1410",
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
}

const editorialHeading = {
  ...heading,
  color: "#F5F0EB",
}

const paragraph = {
  margin: "0 0 8px",
  fontSize: "16px",
  lineHeight: "1.65",
  color: "#3E3329",
}

const editorialParagraph = {
  ...paragraph,
  color: "#D8CEC4",
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

const editorialButton = {
  ...button,
  backgroundColor: "#B36B4D",
  boxShadow: "0 4px 18px rgba(179, 107, 77, 0.4)",
}

const hr = {
  borderColor: "#E9DED4",
  borderStyle: "solid",
  borderWidth: "1px 0 0",
  margin: "0",
}

const editorialHr = {
  ...hr,
  borderColor: "#2C2C2C",
}

const footer = {
  textAlign: "left" as const,
  padding: "18px 28px 24px",
  backgroundColor: "#FFFFFF",
}

const editorialFooter = {
  ...footer,
  backgroundColor: "#1A1A1A",
}

const footerText = {
  margin: "0",
  fontSize: "12px",
  lineHeight: "1.6",
  color: "#796A5E",
}

const editorialFooterText = {
  ...footerText,
  color: "#8A7B6E",
}

const footerLink = {
  color: "#C4623A",
  textDecoration: "underline",
}

const editorialFooterLink = {
  ...footerLink,
  color: "#B36B4D",
}

export default ThrmlTemplate
