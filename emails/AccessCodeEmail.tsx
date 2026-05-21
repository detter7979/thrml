import { Section, Text } from "@react-email/components"
import * as React from "react"

import ThrmlEmailLayout, { THRML_EMAIL_COLORS } from "./ThrmlEmailLayout"

export type AccessCodeEmailProps = {
  preview: string
  guestFirstName: string
  listingTitle: string
  dateTimeLabel: string
  accessCode: string | null
  showAccessCode: boolean
  entryInstructions: string
  houseRules: string[]
  customRulesNote: string | null
  isDefaultRules: boolean
  hostFirstName: string
  bookingUrl: string
  appUrl?: string
}

export function AccessCodeEmail(props: AccessCodeEmailProps) {
  const rulesBlock = props.houseRules.map((rule, index) => (
    <Text key={`rule-${index}`} style={ruleRow}>
      <span style={ruleBullet}>●</span> {rule}
    </Text>
  ))

  return (
    <ThrmlEmailLayout
      preview={props.preview}
      kicker="Access details"
      title="Here's how to get in."
      greeting={`Hi ${props.guestFirstName},`}
      summary={[
        { label: "Space", value: props.listingTitle },
        { label: "When", value: props.dateTimeLabel },
        ...(props.showAccessCode && props.accessCode
          ? [{ label: "Access code", value: props.accessCode }]
          : []),
      ]}
      appUrl={props.appUrl}
      paragraphs={["Here are your access details for your upcoming session."]}
      cta={{ label: "View booking details", href: props.bookingUrl }}
      footnote={`Having trouble? Message ${props.hostFirstName} directly in the app.`}
    >
      {props.showAccessCode && props.accessCode ? (
        <Section style={codeSection}>
          <Text style={codeLabel}>Your access code</Text>
          <Text style={codeValue}>{props.accessCode}</Text>
        </Section>
      ) : null}

      <Section style={instructionsSection}>
        <Text style={codeLabel}>How to get in</Text>
        <Text style={instructionsBody}>{props.entryInstructions}</Text>
      </Section>

      <Section style={rulesSection}>
        <Text style={codeLabel}>House rules</Text>
        {rulesBlock}
        {props.customRulesNote ? (
          <Section style={customNote}>
            <Text style={customNoteTitle}>Additional notes from your host:</Text>
            <Text style={customNoteBody}>{props.customRulesNote}</Text>
          </Section>
        ) : null}
        {props.isDefaultRules ? (
          <Text style={defaultRules}>Standard Thrml community rules</Text>
        ) : null}
      </Section>
    </ThrmlEmailLayout>
  )
}

const codeSection = {
  margin: "0 0 20px",
  padding: "16px 18px",
  backgroundColor: THRML_EMAIL_COLORS.cream,
  border: `1px solid ${THRML_EMAIL_COLORS.orangeLight}`,
}

const codeLabel = {
  margin: "0 0 8px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: THRML_EMAIL_COLORS.muted,
}

const codeValue = {
  margin: 0,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "32px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  color: THRML_EMAIL_COLORS.ink,
}

const instructionsSection = {
  margin: "0 0 20px",
}

const instructionsBody = {
  margin: 0,
  fontSize: "15px",
  lineHeight: "1.65",
  color: THRML_EMAIL_COLORS.body,
}

const rulesSection = {
  margin: "0 0 8px",
}

const ruleRow = {
  margin: "0 0 8px",
  fontSize: "14px",
  lineHeight: "1.55",
  color: THRML_EMAIL_COLORS.body,
}

const ruleBullet = {
  color: THRML_EMAIL_COLORS.orange,
}

const customNote = {
  marginTop: "12px",
  padding: "12px 14px",
  backgroundColor: THRML_EMAIL_COLORS.cream,
  border: `1px solid ${THRML_EMAIL_COLORS.orangeLight}`,
}

const customNoteTitle = {
  margin: "0 0 6px",
  fontSize: "13px",
  fontWeight: 600,
  color: THRML_EMAIL_COLORS.body,
}

const customNoteBody = {
  margin: 0,
  fontSize: "13px",
  lineHeight: "1.5",
  color: THRML_EMAIL_COLORS.body,
}

const defaultRules = {
  margin: "8px 0 0",
  fontSize: "11px",
  textAlign: "center" as const,
  color: THRML_EMAIL_COLORS.muted,
}

export default AccessCodeEmail
