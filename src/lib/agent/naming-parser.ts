/**
 * thrml Paid Media Naming Convention Parser
 *
 * Convention: {PLATFORM}_{PHASE}_{OBJECTIVE}_{TYPE}_{GOAL}_{CONCEPT}_{MARKET}
 *
 * Example: META_P3_CONV_RT_guest_checkout_rt_ALL
 *   → Platform: Meta, Phase: 3, Objective: Conversion,
 *     Type: Retargeting, Goal: Guest, Concept: checkout_rt, Market: All
 *
 * Works at campaign, ad set, and ad level — gracefully handles partial names.
 */

export type ParsedName = {
  raw: string
  platform: string        // Meta | Google | TikTok | Unknown
  phase: string           // "1" | "2" | "3" | ""
  objective: string       // Conversion | Awareness | Traffic | Lead | App | Reach | ""
  type: string            // Prospecting | Retargeting | Lookalike | Broad | ""
  goal: string            // Guest | Host | ""
  concept: string         // remaining middle segments joined
  market: string          // All | Seattle | LA | NYC | ""
  campaignType: string    // prospecting | retargeting | lal | broad (lowercase, for DB)
}

// ── Lookup maps ────────────────────────────────────────────────────────────

const PLATFORM_MAP: Record<string, string> = {
  META: "Meta",
  FB: "Meta",
  FACEBOOK: "Meta",
  GOOG: "Google",
  GOOGLE: "Google",
  GA: "Google",
  GG: "Google",
  TT: "TikTok",
  TIKTOK: "TikTok",
  SNAP: "Snapchat",
  SC: "Snapchat",
}

const OBJECTIVE_MAP: Record<string, string> = {
  CONV: "Conversion",
  CONVERSION: "Conversion",
  PURCHASE: "Conversion",
  AWARE: "Awareness",
  AWARENESS: "Awareness",
  BRAND: "Awareness",
  TRAF: "Traffic",
  TRAFFIC: "Traffic",
  CLICK: "Traffic",
  LEAD: "Lead",
  LEADS: "Lead",
  APP: "App",
  APPSINSTALL: "App",
  REACH: "Reach",
  VIDEO: "Video Views",
  VV: "Video Views",
  ENGAGE: "Engagement",
  ENG: "Engagement",
  MSG: "Messages",
  MESSAGE: "Messages",
}

const TYPE_MAP: Record<string, string> = {
  RT: "Retargeting",
  RET: "Retargeting",
  RETARGET: "Retargeting",
  RETARGETING: "Retargeting",
  PRO: "Prospecting",
  PROSP: "Prospecting",
  PROSPECTING: "Prospecting",
  LAL: "Lookalike",
  LOOKALIKE: "Lookalike",
  LLA: "Lookalike",
  BROAD: "Broad",
  BRD: "Broad",
  INT: "Interest",
  INTEREST: "Interest",
}

const TYPE_DB_MAP: Record<string, string> = {
  RT: "retargeting", RET: "retargeting", RETARGET: "retargeting", RETARGETING: "retargeting",
  PRO: "prospecting", PROSP: "prospecting", PROSPECTING: "prospecting",
  LAL: "lal", LOOKALIKE: "lal", LLA: "lal",
  BROAD: "broad", BRD: "broad",
  INT: "interest", INTEREST: "interest",
}

const GOAL_MAP: Record<string, string> = {
  GUEST: "Guest",
  BOOKING: "Guest",
  BOOK: "Guest",
  HOST: "Host",
  EARN: "Host",
  LIST: "Host",
}

const MARKET_MAP: Record<string, string> = {
  ALL: "All",
  US: "US",
  SEA: "Seattle",
  SEATTLE: "Seattle",
  LA: "Los Angeles",
  NYC: "New York",
  SF: "San Francisco",
  CHI: "Chicago",
  ATL: "Atlanta",
  MIA: "Miami",
  DEN: "Denver",
  PDX: "Portland",
}

const KNOWN_MARKETS = new Set(Object.keys(MARKET_MAP))
const KNOWN_TYPES = new Set(Object.keys(TYPE_MAP))
const KNOWN_OBJECTIVES = new Set(Object.keys(OBJECTIVE_MAP))
const KNOWN_GOALS = new Set(Object.keys(GOAL_MAP))

// ── Parser ─────────────────────────────────────────────────────────────────

export function parseNamingConvention(name: string): ParsedName {
  const raw = name
  const base: ParsedName = {
    raw, platform: "", phase: "", objective: "",
    type: "", goal: "", concept: "", market: "", campaignType: "",
  }

  if (!name) return base

  // Strip any leading/trailing whitespace and split on underscore
  const parts = name.trim().split("_").filter(Boolean)
  if (parts.length === 0) return base

  let cursor = 0

  // [0] Platform
  const p0 = parts[cursor]?.toUpperCase()
  if (p0 && PLATFORM_MAP[p0]) {
    base.platform = PLATFORM_MAP[p0]
    cursor++
  }

  // [1] Phase — matches P\d+ pattern
  const p1 = parts[cursor]?.toUpperCase()
  if (p1 && /^P\d+$/.test(p1)) {
    base.phase = p1.slice(1) // strip the "P"
    cursor++
  }

  // [2] Objective
  const p2 = parts[cursor]?.toUpperCase()
  if (p2 && KNOWN_OBJECTIVES.has(p2)) {
    base.objective = OBJECTIVE_MAP[p2]
    cursor++
  }

  // [3] Type (funnel stage)
  const p3 = parts[cursor]?.toUpperCase()
  if (p3 && KNOWN_TYPES.has(p3)) {
    base.type = TYPE_MAP[p3]
    base.campaignType = TYPE_DB_MAP[p3] ?? ""
    cursor++
  }

  // [4] Goal
  const p4 = parts[cursor]?.toUpperCase()
  if (p4 && KNOWN_GOALS.has(p4)) {
    base.goal = GOAL_MAP[p4]
    cursor++
  }

  // Check last segment for market
  const last = parts[parts.length - 1]?.toUpperCase()
  let marketEnd = parts.length
  if (last && KNOWN_MARKETS.has(last) && parts.length > cursor) {
    base.market = MARKET_MAP[last]
    marketEnd = parts.length - 1
  }

  // Everything between cursor and marketEnd = concept
  base.concept = parts.slice(cursor, marketEnd).join("_")

  return base
}

/**
 * Returns the extra cleaned columns derived from the campaign/adset/ad name.
 * Used in the reporting agent to populate structured columns.
 */
export function parsedNameToColumns(parsed: ParsedName): {
  platform: string
  phase: string
  objective: string
  type: string
  goal: string
  concept: string
  market: string
} {
  return {
    platform: parsed.platform,
    phase: parsed.phase ? `P${parsed.phase}` : "",
    objective: parsed.objective,
    type: parsed.type,
    goal: parsed.goal,
    concept: parsed.concept,
    market: parsed.market,
  }
}
