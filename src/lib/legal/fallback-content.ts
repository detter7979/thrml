import { LEGAL_VERSIONS } from "@/lib/legal-config"
import { TERMS_OF_SERVICE_BODY } from "@/lib/legal/terms-of-service-body"

export type LegalDocumentContent = {
  title: string
  version: string
  effectiveAt: string
  body: string
}

export type LegalDocTypeKey =
  | "privacy_policy"
  | "consumer_health_data_policy"
  | "terms_of_service"
  | "host_terms"

const PRIVACY_BODY = `This Privacy Policy explains how thrml LLC collects, uses, shares, and protects your personal information when you use our platform.

1. Information We Collect
When you create an account or use our platform, we collect name, email, phone, profile photo, payment information (via Stripe), listing details, messages, and reviews. We also collect device/browser data, usage patterns, booking history, and cookies when you consent.

2. How We Use Your Information
We use your information to operate the platform, process bookings and payments, send confirmations, facilitate communication, respond to support requests, detect fraud, comply with legal obligations, and improve our services.

3. How We Share Your Information
We share limited information between Hosts and Guests for bookings. We use service providers (Stripe, Supabase, Vercel, email providers, analytics with consent). We do not sell personal data for money. Advertising technologies may constitute "sharing" under CPRA — you may opt out via Cookie Settings.

4. Cookies and Tracking
You can manage analytics and advertising cookies via Cookie Settings in the footer. Declining stops Google Analytics and the Meta Pixel from loading.

5. Data Retention
Account data is deleted within 30 days of account deletion. Booking and transaction records may be retained up to 7 years for legal compliance.

6. Your Rights
Depending on your location you may have rights to access, correct, delete, or port your data. Submit a request at usethrml.com/privacy-request — we respond within 30 days.

7. California Privacy Rights (CCPA)
California residents may opt out of the sale or sharing of personal information via Cookie Settings or usethrml.com/privacy-request.

8. Contact
For privacy inquiries: hello@usethrml.com`

const CONSUMER_HEALTH_BODY = `Consumer Health Data Privacy Policy — thrml LLC (usethrml.com)

Effective for Washington residents and applicable where required by law.

1. Scope
This policy describes how thrml collects, uses, and shares Consumer Health Data as defined under the Washington My Health My Data Act (MHMDA) and similar laws. Consumer Health Data includes information that identifies a consumer's past, present, or future physical or mental health status, including wellness-service preferences and booking patterns tied to health-related activities.

2. What We Collect
We may collect wellness-service booking history, session waivers, health-related disclaimers you acknowledge, and information you provide about fitness for wellness activities. We do not collect clinical medical records.

3. How We Use Consumer Health Data
We use this data solely to facilitate bookings, safety disclosures, waiver compliance, dispute resolution, and legal obligations. We do not use consumer health data for targeted advertising.

4. Sharing
We do not sell consumer health data. We share only as needed with service providers under contract, between Host and Guest for a confirmed booking, or as required by law.

5. Your Rights
Washington residents may request access, deletion, and withdrawal of consent for consumer health data processing at usethrml.com/privacy-request. We will respond within 30 days.

6. Advertising
thrml does not use consumer health data (including service type or wellness category) in Meta Pixel, Conversions API, or other advertising events.

7. Contact
hello@usethrml.com`

const TERMS_BODY = TERMS_OF_SERVICE_BODY

const HOST_TERMS_BODY = `Host Agreement — thrml LLC

By listing on thrml you agree to the following:

Independent host status: You are an independent host, not an employee of thrml. You are responsible for your space, safety, and guest experiences.

Space safety and compliance: Your space must be safe, functional, and legally permitted for listed activities.

Liability insurance: You maintain liability insurance appropriate for hosting paid guests and will keep coverage while your listing is active. thrml may request proof.

Accurate listings: Represent your space accurately and update material changes promptly.

Platform payments: All payments must be processed through thrml.

You also accept thrml's Terms of Service and Privacy Policy.

Contact: hello@usethrml.com`

export const LEGAL_FALLBACK: Record<LegalDocTypeKey, LegalDocumentContent> = {
  privacy_policy: {
    title: "Privacy Policy",
    version: LEGAL_VERSIONS.PRIVACY,
    effectiveAt: "2026-03-01T00:00:00.000Z",
    body: PRIVACY_BODY,
  },
  consumer_health_data_policy: {
    title: "Consumer Health Data Privacy Policy",
    version: "v1.0-2026-03",
    effectiveAt: "2026-03-01T00:00:00.000Z",
    body: CONSUMER_HEALTH_BODY,
  },
  terms_of_service: {
    title: "Terms of Service",
    version: LEGAL_VERSIONS.TERMS,
    effectiveAt: "2026-03-01T00:00:00.000Z",
    body: TERMS_BODY,
  },
  host_terms: {
    title: "Host Terms of Service",
    version: LEGAL_VERSIONS.HOST_AGREEMENT,
    effectiveAt: "2026-03-01T00:00:00.000Z",
    body: HOST_TERMS_BODY,
  },
}
