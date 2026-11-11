/**
 * Standard UTM templates for paid ads — the single source of truth.
 *
 * IDs, not names, carry the join: utm_content = ad ID, utm_term = ad set / ad group ID,
 * utm_id = campaign ID. The unified report (src/lib/reporting) joins GA4 sessions and
 * bookings to platform data on these IDs and looks names up in the namer, so renaming a
 * campaign never breaks reporting. utm_campaign is only there to make GA4 readable.
 *
 * Mirrored in the namer sheet (UTM Reference tab). Change both together.
 */

/** Meta ad creative `url_tags`. Meta fills the {{…}} macros per ad at click time. */
export const META_URL_TAGS =
  "utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}"

/** Google Ads account-level Final URL suffix (ValueTrack). Keep auto-tagging on as well. */
export const GOOGLE_FINAL_URL_SUFFIX =
  "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_id={campaignid}&utm_term={adgroupid}&utm_content={creative}"

/** Controlled source / medium values for hand-built links (all lowercase). */
export const UTM_SOURCE_MEDIUM = {
  meta_ads: { utm_source: "meta", utm_medium: "paid_social" },
  google_ads: { utm_source: "google", utm_medium: "cpc" },
  email: { utm_source: "email", utm_medium: "email" },
  instagram_organic: { utm_source: "instagram", utm_medium: "organic_social" },
  facebook_organic: { utm_source: "facebook", utm_medium: "organic_social" },
  referral: { utm_source: "<partner_name>", utm_medium: "referral" },
  qr_print: { utm_source: "qr", utm_medium: "offline" },
} as const
