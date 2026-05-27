import type { Metadata } from "next"

import { CookieSettingsLink } from "@/components/cookie-settings-link"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how thrml collects, uses, and protects your personal information.",
  alternates: { canonical: "https://usethrml.com/privacy" },
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-[#1A1410] md:px-8">
      <h1 className="font-serif text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-[#5F5148]">thrml Wellness Marketplace - usethrml.com</p>
      <p className="mt-1 text-sm text-[#5F5148]">Effective Date: March 2026</p>

      <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-[#2F241E]">
        {`This Privacy Policy explains how thrml LLC collects, uses, shares, and protects your personal information when you use our platform.

1. Information We Collect
1.1 Information You Provide
When you create an account or use our platform, we collect:
Name, email address, and phone number
Profile photo (optional)
Payment information (processed and stored by Stripe - we do not store card numbers)
Government-issued ID for Hosts during Stripe identity verification
Listing details provided by Hosts (photos, descriptions, pricing, availability)
Messages sent through the platform between Hosts and Guests
Reviews and ratings submitted after completed bookings

1.2 Information Collected Automatically
When you use the platform we may collect:
Device type, browser, operating system, and IP address
Pages viewed, time spent on pages, and navigation patterns
Booking and transaction history
Location data if you grant permission (used for map-based search features)
Cookies and similar tracking technologies

1.3 Information from Third Parties
We may receive information from:
Stripe: payment status, payout eligibility, and identity verification status
Social media platforms if you choose to connect your account
Analytics providers

2. How We Use Your Information
We use your information to:
Create and manage your account
Process bookings and payments
Send booking confirmations, access codes, and session reminders
Facilitate communication between Hosts and Guests
Display listings and enable search functionality
Promote Host listings on thrml's social media and marketing channels (Hosts may opt out)
Respond to support requests and resolve disputes
Detect and prevent fraud, abuse, and platform policy violations
Comply with legal obligations
Improve and develop our platform and services

3. How We Share Your Information
3.1 With Other Users
When a booking is made, limited information is shared between Hosts and Guests, including name, profile photo, and relevant booking details. Access codes are shared only with the confirmed Guest.

3.2 With Service Providers
We share information with trusted third-party service providers who help us operate the platform, including:
Stripe (payment processing and Host identity verification)
Resend or similar providers (transactional email delivery)
Supabase (database and authentication infrastructure)
Vercel (platform hosting)
Analytics and performance monitoring tools
These providers are contractually obligated to protect your information and use it only for the purposes we specify.

3.3 For Marketing
With Host consent, we may share listing content (photos, descriptions, location) publicly on thrml's social media channels for promotional purposes. We do not sell Host or Guest personal data to advertisers.

3.4 Legal Requirements
We may disclose information when required by law, court order, or government authority, or to protect the rights, property, or safety of thrml, our users, or the public.

3.5 Business Transfers
In the event of a merger, acquisition, or sale of substantially all of thrml's assets, user information may be transferred as part of that transaction. We will provide notice before your information is transferred and becomes subject to a different privacy policy.`}
      </div>

      <section id="cookies" className="mt-8 text-sm leading-relaxed text-[#2F241E]">
        <h2 className="text-base font-semibold text-[#1A1410]">4. Cookies and Tracking</h2>
        <p className="mt-3">
          We use cookies and similar technologies to maintain sessions, remember preferences, and analyze platform
          usage. You can manage analytics and advertising cookies at any time through{" "}
          <CookieSettingsLink className="text-[#C4623A] underline hover:text-[#b05530]" /> (also available in the site
          footer). Declining analytics cookies stops Google Analytics and the Meta Pixel from loading on your device.
          Disabling essential cookies in your browser may affect platform functionality.
        </p>
        <p className="mt-3">
          We use the Meta Pixel and similar advertising technologies to measure the performance of our advertising.
          Under some state privacy laws (including California&apos;s CPRA), the use of these technologies may be
          considered a &quot;sale&quot; or &quot;sharing&quot; of personal information. You can opt out of this sharing
          at any time using the &quot;Do Not Sell or Share My Personal Information&quot; mechanism described in Section
          7, or by adjusting your cookie preferences via{" "}
          <CookieSettingsLink className="text-[#C4623A] underline hover:text-[#b05530]" />.
        </p>
      </section>

      <section id="data-retention" className="mt-8 text-sm leading-relaxed text-[#2F241E]">
        <h2 className="text-base font-semibold text-[#1A1410]">5. Data Retention</h2>

        <p className="mt-3">
          We retain your personal data only for as long as necessary to provide our services, meet legal obligations,
          resolve disputes, and enforce our agreements. The table below summarises our standard retention periods.
        </p>

        <div className="mt-5 overflow-x-auto rounded-xl border border-[#E8DDD6]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8DDD6] bg-[#FAF6F2]">
                <th className="px-4 py-3 text-left font-medium text-[#5F5148]">Data type</th>
                <th className="px-4 py-3 text-left font-medium text-[#5F5148]">Retention period</th>
                <th className="px-4 py-3 text-left font-medium text-[#5F5148]">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E8E2]">
              <tr className="bg-white">
                <td className="px-4 py-3 text-[#2F241E]">Location data</td>
                <td className="px-4 py-3 text-[#2F241E]">
                  Retained only during active session use; not stored after search completes unless tied to a booking
                </td>
                <td className="px-4 py-3 text-[#5F5148]">Map-based search functionality</td>
              </tr>
              <tr className="bg-[#FAF6F2]">
                <td className="px-4 py-3 text-[#2F241E]">Account &amp; profile data</td>
                <td className="px-4 py-3 text-[#2F241E]">Deleted within 30 days of account deletion</td>
                <td className="px-4 py-3 text-[#5F5148]">User-requested deletion</td>
              </tr>
              <tr className="bg-[#FAF6F2]">
                <td className="px-4 py-3 text-[#2F241E]">Booking &amp; transaction records</td>
                <td className="px-4 py-3 text-[#2F241E]">Up to 7 years</td>
                <td className="px-4 py-3 text-[#5F5148]">Financial and legal compliance (IRS, state tax)</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 text-[#2F241E]">Messages between users</td>
                <td className="px-4 py-3 text-[#2F241E]">Up to 2 years</td>
                <td className="px-4 py-3 text-[#5F5148]">Dispute resolution</td>
              </tr>
              <tr className="bg-[#FAF6F2]">
                <td className="px-4 py-3 text-[#2F241E]">Payment method data</td>
                <td className="px-4 py-3 text-[#2F241E]">Managed by Stripe — not stored by thrml</td>
                <td className="px-4 py-3 text-[#5F5148]">See Stripe&apos;s privacy policy</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 text-[#2F241E]">Analytics data (GA4)</td>
                <td className="px-4 py-3 text-[#2F241E]">14 months (Google&apos;s default retention)</td>
                <td className="px-4 py-3 text-[#5F5148]">
                  Platform improvement; only collected with your consent
                </td>
              </tr>
              <tr className="bg-[#FAF6F2]">
                <td className="px-4 py-3 text-[#2F241E]">Advertising data (Meta Pixel)</td>
                <td className="px-4 py-3 text-[#2F241E]">Up to 180 days (Meta&apos;s default)</td>
                <td className="px-4 py-3 text-[#5F5148]">Ad performance measurement; only collected with your consent</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 text-[#2F241E]">Cookies &amp; session data</td>
                <td className="px-4 py-3 text-[#2F241E]">
                  Session cookies expire when you close your browser; persistent cookies up to 12 months
                </td>
                <td className="px-4 py-3 text-[#5F5148]">Authentication and preference memory</td>
              </tr>
              <tr className="bg-[#FAF6F2]">
                <td className="px-4 py-3 text-[#2F241E]">Support &amp; dispute records</td>
                <td className="px-4 py-3 text-[#2F241E]">Up to 3 years</td>
                <td className="px-4 py-3 text-[#5F5148]">Legal protection and platform integrity</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 text-[#2F241E]">Anonymised analytics</td>
                <td className="px-4 py-3 text-[#2F241E]">Indefinite</td>
                <td className="px-4 py-3 text-[#5F5148]">Aggregate product insights (no personal identifiers)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4">
          <strong>Early deletion requests:</strong> You may request early deletion of your data at any time by
          contacting{" "}
          <a href="mailto:hello@usethrml.com" className="text-[#C4623A] underline hover:text-[#b05530]">
            hello@usethrml.com
          </a>
          . We will action your request within 30 days, subject to the legal retention requirements noted above.
          Deletion of booking and transaction records may not be possible where retention is required for tax or legal
          compliance.
        </p>

        <p className="mt-3">
          <strong>Third-party retention:</strong> Data processed by our service providers (Stripe, Google, Meta,
          Supabase, Resend) is subject to their own data retention policies. We encourage you to review each
          provider&apos;s privacy policy for details.
        </p>
      </section>

      <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-[#2F241E]">
        {`6. Your Rights and Choices
Depending on your location, you may have the following rights regarding your personal data:
Access: Request a copy of the personal information we hold about you
Correction: Request correction of inaccurate or incomplete information
Deletion: Request deletion of your personal data, subject to legal retention requirements
Portability: Request your data in a portable format
Opt-out: Opt out of marketing communications at any time
Restrict processing: Request that we limit how we use your data in certain circumstances
To exercise any of these rights, contact us at hello@usethrml.com. We will respond within 30 days.`}
      </div>

      <div className="mt-8 text-sm leading-relaxed text-[#2F241E]">
        <h2 className="whitespace-pre-line font-normal">{`7. California Privacy Rights (CCPA)`}</h2>
        <p className="mt-3">
          California residents have additional rights under the California Consumer Privacy Act, including the right to
          know what personal information is collected, the right to delete, and the right to opt out of the sale of
          personal information. California residents have the right to opt out of the &quot;sale&quot; or
          &quot;sharing&quot; of personal information. While thrml does not sell personal information for money, our
          use of advertising technologies such as the Meta Pixel may constitute &quot;sharing&quot; under the CPRA. You
          may opt out at any time by{" "}
          <CookieSettingsLink className="text-[#C4623A] underline hover:text-[#b05530]" /> or by contacting us at{" "}
          hello@usethrml.com. To submit a CCPA request, contact us at the address below.
        </p>
        <p className="mt-3">
          Other U.S. State Privacy Rights. Residents of certain other states (including Virginia, Colorado, Connecticut,
          and others with comprehensive privacy laws) may have similar rights to access, correct, delete, and opt out
          of certain processing of their personal information. To exercise any such rights, contact us at
          hello@usethrml.com and we will respond as required by applicable law.
        </p>
      </div>

      <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-[#2F241E]">
        {`8. Children's Privacy
The thrml platform is not intended for individuals under 18 years of age. We do not knowingly collect personal information from minors. If we become aware that we have collected information from a minor, we will delete it promptly.

9. Security
We implement industry-standard security measures including encryption in transit (TLS), encrypted storage, access controls, and regular security reviews. However, no system is completely secure. We encourage users to use strong passwords and protect their account credentials.
In the event of a data breach that affects your rights or freedoms, we will notify affected users as required by applicable law.

10. Third-Party Links
The platform may contain links to third-party websites or services. We are not responsible for the privacy practices of those sites and encourage you to review their privacy policies independently.

11. Changes to This Policy
We may update this Privacy Policy from time to time. We will notify you of material changes by email or via notice on the platform. The date at the top of this policy reflects the most recent revision.

12. Contact
For privacy-related inquiries, data requests, or to report a concern,
contact us at: hello@usethrml.com`}
      </div>
    </main>
  )
}
