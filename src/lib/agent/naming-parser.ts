/**
 * thrml Paid Media Naming Convention Parser — v2
 *
 * Three-level hierarchy:
 *
 * CAMPAIGN: [PLATFORM]_[PHASE]_[OBJECTIVE]_[FUNNEL]_[AUDIENCE_TYPE]_[GEO]
 *   e.g.  META_P1_REACH_PROSP_host_gen_ALL
 *
 * AD SET:   [CAMPAIGN]_[SPACE_TYPE]_[AUDIENCE_SRC]_[PLACEMENT]
 *   e.g.  META_P1_REACH_PROSP_host_gen_ALL_sauna_int_FEED-STORIES
 *
 * AD:       [AD_SET]_[TEST_ID]_[VARIANT]_[ANGLE]_[FORMAT]_[CTA]
 *   e.g.  META_P1_REACH_PROSP_host_gen_ALL_sauna_int_FEED-STORIES_T01_A_income_Static_9x16_list_now
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

const AUD_SRC_MAP: Record<string, string> = {
  INT: "Interest", LAL1: "1% LAL", LAL2: "2% LAL",
  CRMATCH: "CRM Match", RT: "Retarget",
}

const PLACEMENT_MAP: Record<string, string> = {
  "FEED-STORIES": "Feed + Stories", FEED: "Feed", REELS: "Reels",
  STORIES: "Stories", SEARCH: "Search", PMAX: "Performance Max",
  "DEMAND-GEN": "Demand Gen",
}

const FORMAT_MAP: Record<string, string> = {
  "STATIC_9X16": "Static 9:16", "STATIC_1X1": "Static 1:1", "STATIC_4X5": "Static 4:5",
  "VIDEO_15S": "Video 15s", "VIDEO_30S": "Video 30s",
  CAROUSEL: "Carousel", UGC: "UGC", RSA: "RSA",
}

const CTA_MAP: Record<string, string> = {
  LIST_NOW: "List Now", LEARN_MORE: "Learn More", GET_STARTED: "Get Started",
  SEE_HOW: "See How", BOOK_NOW: "Book Now", SIGN_UP: "Sign Up",
}

const KNOWN_GEOS      = new Set(Object.keys(GEO_MAP))
const KNOWN_PLACEMENTS = new Set(Object.keys(PLACEMENT_MAP))
const KNOWN_FORMATS    = new Set(Object.keys(FORMAT_MAP))
const KNOWN_CTAS       = new Set(Object.keys(CTA_MAP))
const KNOWN_AUD_SRCS   = new Set(Object.keys(AUD_SRC_MAP))
const KNOWN_SPACE_TYPES = new Set(Object.keys(SPACE_TYPE_MAP))

// ── Types ─────────────────────────────────────────────────────────────────

export type ParsedCampaign = {
  raw: string
  platform: string       // Meta | Google | TikTok
  phase: string          // P1 | P2 | P3
  campaignObjective: string // Reach | Lead | Conversion | Awareness
  funnelStage: string    // Prospecting | Lookalike | Retargeting | CRM
  audienceType: string   // host_gen | host_sauna | guest_wellness | guest_biohacking
  audienceGroup: string  // Host | Guest (derived from audienceType)
  geo: string            // All | Seattle | US
}

export type ParsedAdSet = ParsedCampaign & {
  spaceType: string      // Sauna | Hot Tub | Cold Plunge | General
  audienceSource: string // Interest | 1% LAL | CRM Match | Retarget
  placement: string      // Feed + Stories | Reels | Search
}

export type ParsedAd = ParsedAdSet & {
  testId: string         // T01 | T02 | T03
  variant: string        // A | B | C
  angle: string          // income | community | idle_space | social_proof
  format: string         // Static 9:16 | Video 15s | Carousel | UGC
  cta: string            // List Now | Book Now | Get Started
  optEvent: string       // become_host_click | host_onboarding_started | listing_created | Purchase
}

// ── Campaign parser ────────────────────────────────────────────────────────

export function parseCampaignName(name: string): ParsedCampaign {
  const parts = (name || "").trim().split("_").filter(Boolean)
  const base: ParsedCampaign = {
    raw: name, platform: "", phase: "", campaignObjective: "",
    funnelStage: "", audienceType: "", audienceGroup: "", geo: "",
  }
  let c = 0

  // [0] Platform
  if (PLATFORM_MAP[parts[c]?.toUpperCase()]) base.platform = PLATFORM_MAP[parts[c++].toUpperCase()]

  // [1] Phase
  if (/^P\d+$/i.test(parts[c] ?? "")) base.phase = parts[c++].toUpperCase()

  // [2] Objective
  if (OBJECTIVE_MAP[parts[c]?.toUpperCase()]) base.campaignObjective = OBJECTIVE_MAP[parts[c++].toUpperCase()]

  // [3] Funnel — handle LAL1/LAL2 before generic LAL
  const f = parts[c]?.toUpperCase()
  if (f && FUNNEL_MAP[f]) { base.funnelStage = FUNNEL_MAP[f]; c++ }

  // [4+5] Audience type — always 2 tokens: {host|guest}_{subtype}
  // The next token starts with "host" or "guest", pair it with the following token
  const at1 = parts[c]?.toLowerCase()
  const at2 = parts[c + 1]?.toLowerCase()
  if (at1 && (at1 === "host" || at1 === "guest") && at2 && !KNOWN_GEOS.has(at2.toUpperCase())) {
    base.audienceType = `${at1}_${at2}`
    base.audienceGroup = at1 === "host" ? "Host" : "Guest"
    c += 2
  } else if (at1 && (at1.startsWith("host") || at1.startsWith("guest"))) {
    // Single token audience type like "host" or "guest"
    base.audienceType = at1
    base.audienceGroup = at1.startsWith("host") ? "Host" : "Guest"
    c++
  }

  // [last campaign token] Geo
  if (KNOWN_GEOS.has(parts[c]?.toUpperCase())) {
    base.geo = GEO_MAP[parts[c].toUpperCase()]
    c++
  }

  return base
}

// ── Ad Set parser ─────────────────────────────────────────────────────────

export function parseAdSetName(name: string): ParsedAdSet {
  const camp = parseCampaignName(name)
  const parts = (name || "").trim().split("_").filter(Boolean)

  // Find where campaign ends — count campaign tokens consumed
  let c = 0
  if (PLATFORM_MAP[parts[c]?.toUpperCase()]) c++
  if (/^P\d+$/i.test(parts[c] ?? "")) c++
  if (OBJECTIVE_MAP[parts[c]?.toUpperCase()]) c++
  if (FUNNEL_MAP[parts[c]?.toUpperCase()]) c++
  const at1 = parts[c]?.toLowerCase()
  const at2 = parts[c + 1]?.toLowerCase()
  if (at1 && (at1 === "host" || at1 === "guest") && at2 && !KNOWN_GEOS.has(at2.toUpperCase())) {
    c += 2
  } else if (at1 && (at1.startsWith("host") || at1.startsWith("guest"))) {
    c++
  }
  if (KNOWN_GEOS.has(parts[c]?.toUpperCase())) c++

  // Now parse ad set extension: [SPACE_TYPE]_[AUDIENCE_SRC]_[PLACEMENT]
  const adSetBase: ParsedAdSet = {
    ...camp, spaceType: "", audienceSource: "", placement: "",
  }

  if (KNOWN_SPACE_TYPES.has(parts[c]?.toUpperCase())) {
    adSetBase.spaceType = SPACE_TYPE_MAP[parts[c++].toUpperCase()]
  }
  if (KNOWN_AUD_SRCS.has(parts[c]?.toUpperCase())) {
    adSetBase.audienceSource = AUD_SRC_MAP[parts[c++].toUpperCase()]
  }
  // Placement may contain hyphens — reconstruct from remaining tokens before ad-level tokens
  const placementParts: string[] = []
  while (c < parts.length && !(/^T\d+$/i.test(parts[c]))) {
    placementParts.push(parts[c++])
  }
  const placementKey = placementParts.join("-").toUpperCase()
  if (KNOWN_PLACEMENTS.has(placementKey)) {
    adSetBase.placement = PLACEMENT_MAP[placementKey]
  } else if (placementParts.length) {
    adSetBase.placement = placementParts.join("-")
  }

  return adSetBase
}

// ── Ad (creative) parser ──────────────────────────────────────────────────

export function parseAdName(name: string): ParsedAd {
  const adset = parseAdSetName(name)
  const parts = (name || "").trim().split("_").filter(Boolean)

  // Find T\d+ token — that's where ad-level tokens begin
  let c = parts.findIndex(p => /^T\d+$/i.test(p))
  if (c === -1) {
    return { ...adset, testId: "", variant: "", angle: "", format: "", cta: "", optEvent: "" }
  }

  const testId  = parts[c++]?.toUpperCase() ?? ""
  const variant = parts[c++]?.toUpperCase() ?? ""

  // ANGLE: free text until FORMAT (known value) is found
  const angleParts: string[] = []
  while (c < parts.length && !KNOWN_FORMATS.has(parts.slice(c, c + 2).join("_").toUpperCase()) && !KNOWN_FORMATS.has(parts[c]?.toUpperCase())) {
    angleParts.push(parts[c++])
  }

  // FORMAT: may be 2 tokens like Static_9x16 or Video_15s
  let format = ""
  const fmt1 = parts[c]?.toUpperCase()
  const fmt2 = parts[c + 1]?.toUpperCase()
  const fmt2token = fmt2 ? `${fmt1}_${fmt2}` : ""
  if (fmt2token && KNOWN_FORMATS.has(fmt2token)) {
    format = FORMAT_MAP[fmt2token]; c += 2
  } else if (fmt1 && KNOWN_FORMATS.has(fmt1)) {
    format = FORMAT_MAP[fmt1]; c++
  }

  // CTA: last token
  const ctaKey = parts[c]?.toUpperCase()
  const cta = ctaKey && KNOWN_CTAS.has(ctaKey) ? CTA_MAP[ctaKey] : (parts[c] ?? "")

  // Derive optimization event from phase
  const phaseNum = parseInt(adset.phase.replace("P", "") || "0")
  const group = adset.audienceGroup
  let optEvent = ""
  if (group === "Host") {
    optEvent = phaseNum === 1 ? "become_host_click" : phaseNum === 2 ? "host_onboarding_started" : "listing_created"
  } else {
    optEvent = phaseNum <= 2 ? "ViewContent" : "Purchase"
  }

  return {
    ...adset,
    testId, variant: variant.toUpperCase(),
    angle: angleParts.join("_"),
    format,
    cta,
    optEvent,
  }
}

// ── Convenience: parse any level ──────────────────────────────────────────

export function parseNamingConvention(name: string): ParsedAd {
  return parseAdName(name)
}
