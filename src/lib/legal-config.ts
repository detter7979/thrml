/**
 * Single source of truth for published legal document versions.
 * When terms, privacy, or host agreement pages change materially, bump the matching value
 * and deploy so clients / profile writes stay aligned with on-site policy text.
 */
export const LEGAL_VERSIONS = {
  TERMS: "v1.0",
  PRIVACY: "v1.0",
  HOST_AGREEMENT: "host-v1.0-2026-03",
} as const
