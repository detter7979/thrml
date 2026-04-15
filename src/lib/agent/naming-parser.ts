/**
 * thrml Paid Media Naming Convention Parser — v3
 * Adds split fields: audienceInterest, audSrcType, audSrcTier, formatType, formatLength, formatRatio
 */

// ── Lookup tables ──────────────────────────────────────────────────────────

const PLATFORM_MAP: Record<string, string> = {
  META: "Meta", FB: "Meta", FACEBOOK: "Meta",
  GOOG: "Google", GOOGLE: "Google", GA: "Google",
  SNAP: "Snapchat", TIKTOK: "TikTok", TT: "TikTok",
}

const OBJECTIVE_MAP: Record<string, string> = {
  REACH: "Reach", LEAD: "Lead", LEADS: "Lead",
  CONV: "Conversion", CONVERSION: "Conversion",
  AWARE: "Awareness", AWARENESS: "Awareness",
  TRAF: "Traffic", TRAFFIC: "Traffic",
  APP: "App", VV: "Video Views",
}

const FUNNEL_MAP: Record<string, string> = {
  PROSP: "Prospecting", PROSPECTING: "Prospecting",
  LAL: "Lookalike", LAL1: "Lookalike (1%)", LAL2: "Lookalike (2%)",
  RT: "Retargeting", RETARGET: "Retargeting",
  CRM: "CRM",
}

const GEO_MAP: Record<string, string> = {
  ALL: "All", SEA: "Seattle", US: "US",
  LA: "Los Angeles", SF: "San Francisco", NYC: "New York",
  CHI: "Chicago", PDX: "Portland", MIA: "Miami",
}

const SPACE_TYPE_MAP: Record<string, string> = {
  GEN: "General", SAUNA: "Sauna", HOTTUB: "Hot Tub",
  COLDPLUNGE: "Cold Plunge", COLD: "Cold Plunge",
}

// Audience source → split into type + tier
const AUD_SRC_TYPE_MAP: Record<string, string> = {
  INT: "Interest",
  LAL1: "LAL", LAL2: "LAL", LAL: "LAL",
  CRMATCH: "CRM", CRM: "CRM",
  RT: "Retargeting",
  RT_CHECKOUT: "Retargeting", RT_LISTING: "Retargeting",
}

const AUD_SRC_TIER_MAP: Record<string, string> = {
  INT: "—",
  LAL1: "1%", LAL2: "2%", LAL: "—",
  CRMATCH: "—", CRM: "—",
  RT: "—",
  RT_CHECKOUT: "checkout", RT_LISTING: "listing",
}

const PLACEMENT_MAP: Record<string, string> = {
  "FEED-STORIES": "Feed + Stories", FEED: "Feed", REELS: "Reels",
  STORIES: "Stories", SEARCH: "Search", PMAX: "Performance Max",
  "DEMAND-GEN": "Demand Gen",
}

// Format → split into type + length + ratio
const FORMAT_TYPE_MAP: Record<string, string> = {
  "STATIC_9X16": "Static", "STATIC_1X1": "Static", "STATIC_4X5": "Static",
  "VIDEO_15S": "Video", "VIDEO_30S": "Video", "VIDEO_6S": "Video", "VIDEO_60S": "Video",
  "CAROUSEL": "Carousel", "UGC": "UGC", "RSA": "RSA",
}
const FORMAT_LENGTH_MAP: Record<string, string> = {
  "STATIC_9X16": "NA", "STATIC_1X1": "NA", "STATIC_4X5": "NA",
  "VIDEO_15S": "15s", "VIDEO_30S": "30s", "VIDEO_6S": "6s", "VIDEO_60S": "60s",
  "CAROUSEL": "NA", "UGC": "NA", "RSA": "NA",
}
const FORMAT_RATIO_MAP: Record<string, string> = {
  "STATIC_9X16": "9x16", "STATIC_1X1": "1x1", "STATIC_4X5": "4x5",
  "VIDEO_15S": "9x16", "VIDEO_30S": "9x16", "VIDEO_6S": "9x16", "VIDEO_60S": "9x16",
  "CAROUSEL": "1x1", "UGC": "9x16", "RSA": "NA",
}

const CTA_MAP: Record<string, string> = {
  LIST_NOW: "List Now", LEARN_MORE: "Learn More", GET_STARTED: "Get Started",
  SEE_HOW: "See How", BOOK_NOW: "Book Now", SIGN_UP: "Sign Up",
}

const KNOWN_GEOS       = new Set(Object.keys(GEO_MAP))
const KNOWN_PLACEMENTS = new Set(Object.keys(PLACEMENT_MAP))
const KNOWN_FORMATS    = new Set(Object.keys(FORMAT_TYPE_MAP))
const KNOWN_CTAS       = new Set(Object.keys(CTA_MAP))
const KNOWN_SPACE_TYPES = new Set(Object.keys(SPACE_TYPE_MAP))
const KNOWN_AUD_SRCS   = new Set(Object.keys(AUD_SRC_TYPE_MAP))

// ── Types ─────────────────────────────────────────────────────────────────

export type ParsedName = {
  raw: string
  platform: string
  phase: string
  campaignObjective: string
  funnelStage: string
  // Audience — split fields
  audienceType: string       // full e.g. host_gen
  audienceGroup: string      // host | guest
  audienceInterest: string   // gen | sauna | hottub | wellness | biohacking
  geo: string
  // Ad Set — split fields
  spaceType: string
  audSrcRaw: string          // raw token: int | lal1 | rt_checkout etc.
  audienceSource: string     // Interest | LAL | Retargeting | CRM
  audienceTier: string       // 1% | 2% | checkout | listing | —
  placement: string
  // Ad — split fields
  testId: string
  variant: string
  angle: string
  format: string             // full e.g. "Static 9:16" (kept for backward compat)
  formatType: string         // Static | Video | Carousel | UGC | RSA
  formatLength: string       // NA | 6s | 15s | 30s | 60s
  formatRatio: string        // 9x16 | 1x1 | 4x5 | NA
  cta: string
  optEvent: string
  campaignType: string
}

// ── Parser ────────────────────────────────────────────────────────────────

export function parseNamingConvention(name: string): ParsedName {
  const raw = name
  const base: ParsedName = {
    raw, platform: "", phase: "", campaignObjective: "", funnelStage: "",
    audienceType: "", audienceGroup: "", audienceInterest: "", geo: "",
    spaceType: "", audSrcRaw: "", audienceSource: "", audienceTier: "", placement: "",
    testId: "", variant: "", angle: "", format: "",
    formatType: "", formatLength: "NA", formatRatio: "NA",
    cta: "", optEvent: "", campaignType: "",
  }

  if (!name) return base
  const parts = name.trim().split("_").filter(Boolean)
  if (parts.length === 0) return base

  let c = 0

  // [0] Platform
  const p0 = parts[c]?.toUpperCase()
  if (p0 && PLATFORM_MAP[p0]) { base.platform = PLATFORM_MAP[p0]; c++ }

  // [1] Phase
  if (/^P\d+$/i.test(parts[c] ?? "")) { base.phase = parts[c++].toUpperCase() }

  // [2] Objective
  const p2 = parts[c]?.toUpperCase()
  if (p2 && OBJECTIVE_MAP[p2]) { base.campaignObjective = OBJECTIVE_MAP[p2]; c++ }

  // [3] Funnel — check LAL1/LAL2 before LAL
  const p3 = parts[c]?.toUpperCase()
  if (p3 && FUNNEL_MAP[p3]) {
    base.funnelStage = FUNNEL_MAP[p3]
    base.campaignType = p3.toLowerCase()
    c++
  }

  // [4+5] Audience type = {host|guest}_{subtype} — always 2 tokens
  const at1 = parts[c]?.toLowerCase()
  const at2 = parts[c + 1]?.toLowerCase()
  if (at1 && (at1 === "host" || at1 === "guest")) {
    if (at2 && !KNOWN_GEOS.has(at2.toUpperCase())) {
      base.audienceType = `${at1}_${at2}`
      base.audienceGroup = at1 === "host" ? "Host" : "Guest"
      base.audienceInterest = at2          // <-- split: gen | sauna | wellness | checkout_rt
      c += 2
    } else {
      base.audienceType = at1
      base.audienceGroup = at1 === "host" ? "Host" : "Guest"
      base.audienceInterest = ""
      c++
    }
  }

  // [geo] — last campaign token
  if (KNOWN_GEOS.has(parts[c]?.toUpperCase())) { base.geo = GEO_MAP[parts[c++].toUpperCase()] }

  // [space type]
  if (KNOWN_SPACE_TYPES.has(parts[c]?.toUpperCase())) {
    base.spaceType = SPACE_TYPE_MAP[parts[c++].toUpperCase()]
  }

  // [audience source] — may be multi-token like rt_checkout
  // Try 2-token combo first (rt_checkout, rt_listing)
  const as2 = parts.slice(c, c + 2).join("_").toUpperCase()
  const as1 = parts[c]?.toUpperCase()
  if (as2 && KNOWN_AUD_SRCS.has(as2)) {
    base.audSrcRaw = as2.toLowerCase()
    base.audienceSource = AUD_SRC_TYPE_MAP[as2]
    base.audienceTier   = AUD_SRC_TIER_MAP[as2]
    c += 2
  } else if (as1 && KNOWN_AUD_SRCS.has(as1)) {
    base.audSrcRaw = as1.toLowerCase()
    base.audienceSource = AUD_SRC_TYPE_MAP[as1]
    base.audienceTier   = AUD_SRC_TIER_MAP[as1]
    c++
  }

  // [placement] — may contain hyphens, ends at T\d+
  const placementParts: string[] = []
  while (c < parts.length && !(/^T\d+$/i.test(parts[c]))) {
    placementParts.push(parts[c++])
  }
  const placementKey = placementParts.join("-").toUpperCase()
  base.placement = PLACEMENT_MAP[placementKey] ?? placementParts.join("-")

  // [T\d+] Test ID
  const ti = parts.findIndex((p, i) => i >= c && /^T\d+$/i.test(p))
  if (ti < 0) return base

  c = ti
  base.testId = parts[c++]?.toUpperCase() ?? ""
  base.variant = parts[c++]?.toUpperCase() ?? ""

  // [angle] — until FORMAT token
  const angleParts: string[] = []
  while (c < parts.length) {
    const f1 = parts[c]?.toUpperCase()
    const f2 = parts[c + 1]?.toUpperCase()
    const f2key = f2 ? `${f1}_${f2}` : ""
    if (KNOWN_FORMATS.has(f2key) || KNOWN_FORMATS.has(f1)) break
    angleParts.push(parts[c++])
  }
  base.angle = angleParts.join("_")

  // [format] — 1 or 2 tokens
  const f1 = parts[c]?.toUpperCase()
  const f2 = parts[c + 1]?.toUpperCase()
  const f2key = f2 ? `${f1}_${f2}` : ""
  let fmtKey = ""
  if (f2key && KNOWN_FORMATS.has(f2key)) { fmtKey = f2key; c += 2 }
  else if (f1 && KNOWN_FORMATS.has(f1)) { fmtKey = f1; c++ }

  if (fmtKey) {
    base.formatType   = FORMAT_TYPE_MAP[fmtKey]
    base.formatLength = FORMAT_LENGTH_MAP[fmtKey]
    base.formatRatio  = FORMAT_RATIO_MAP[fmtKey]
    base.format = `${base.formatType}${base.formatLength !== "NA" ? " " + base.formatLength : ""}${base.formatRatio !== "NA" ? " " + base.formatRatio : ""}`
  }

  // [CTA]
  const ctaKey = parts[c]?.toUpperCase()
  base.cta = ctaKey && CTA_MAP[ctaKey] ? CTA_MAP[ctaKey] : (parts[c] ?? "")

  // [opt event] — derived from phase + audience group
  const phaseNum = parseInt(base.phase.replace("P", "") || "0")
  const isHost = base.audienceGroup === "Host"
  if (isHost) {
    base.optEvent = phaseNum === 1 ? "become_host_click"
      : phaseNum === 2 ? "host_onboarding_started"
      : "listing_created"
  } else {
    base.optEvent = phaseNum >= 3 ? "Purchase"
      : phaseNum === 2 ? "InitiateCheckout"
      : "ViewContent"
  }

  return base
}

export function parsedNameToColumns(p: ParsedName) {
  return {
    platform: p.platform,
    phase: p.phase,
    campaignObjective: p.campaignObjective,
    funnelStage: p.funnelStage,
    audienceGroup: p.audienceGroup,
    audienceInterest: p.audienceInterest,
    geo: p.geo,
    spaceType: p.spaceType,
    audienceSource: p.audienceSource,
    audienceTier: p.audienceTier,
    placement: p.placement,
    testId: p.testId,
    variant: p.variant,
    angle: p.angle,
    formatType: p.formatType,
    formatLength: p.formatLength,
    formatRatio: p.formatRatio,
    cta: p.cta,
    optEvent: p.optEvent,
  }
}
