/**
 * Single source of truth for published legal document versions.
 * When terms, privacy, or host agreement pages change materially, bump the matching value
 * and deploy so clients / profile writes stay aligned with on-site policy text.
 */
export const LEGAL_VERSIONS = {
  // Must match the active rows in legal_documents (the published text).
  TERMS: "v1.1",
  PRIVACY: "v1.1",
  HOST_AGREEMENT: "host-v1.1-2026-10",
} as const
