import type {
  AdFormatT,
  BudgetModeT,
  EventT,
  FunnelT,
  PersonaT,
  PhaseT,
  PlacementT,
  PlatformT,
  ServiceT,
} from "@/types/paid-media"

const PLATFORMS = new Set<PlatformT>(["META", "GOOG", "SNAP", "TIKTOK", "LINKEDIN"])
const PERSONAS = new Set<PersonaT>(["host", "guest"])
const SERVICES = new Set<ServiceT>(["sauna", "hottub", "coldplunge", "multi", "all"])
const PHASES = new Set<PhaseT>(["P1", "P2", "P3"])
const FUNNELS = new Set<FunnelT>(["PROSP", "LAL", "RT", "CRM"])
const EVENTS = new Set<EventT>(["BH", "HO", "NL", "ACT", "VC", "IC", "PUR"])

const PLACEMENT_SUFFIXES: PlacementT[] = [
  "DEMAND-GEN",
  "FEED-STORIES",
  "ADV-PLUS",
  "PMAX",
  "REELS",
  "SEARCH",
]

export type ParsedCampaignConvention = {
  legacy_id: string | null
  name: string
  platform: PlatformT
  persona: PersonaT
  service: ServiceT
  geo: string
  phase: PhaseT
  funnel: FunnelT
  event: EventT
  launch_week: string
  version: string
}

export type ParsedAdSetConvention = {
  legacy_id: string | null
  name: string
  audience_src: string
  placement: PlacementT
}

export function parseCampaignConventionName(raw: string): ParsedCampaignConvention | null {
  const name = raw.trim()
  if (!name) return null

  const parts = name.split("_").filter(Boolean)
  if (parts.length < 7) return null

  let i = 0
  let legacy_id: string | null = null
  if (/^C\d+$/i.test(parts[0] ?? "")) {
    legacy_id = parts[0]!.toUpperCase()
    i++
  }

  const platform = parts[i]?.toUpperCase() as PlatformT
  if (!PLATFORMS.has(platform)) return null
  i++

  const persona = parts[i]?.toLowerCase() as PersonaT
  if (!PERSONAS.has(persona)) return null
  i++

  const service = parts[i]?.toLowerCase() as ServiceT
  if (!SERVICES.has(service)) return null
  i++

  const geo = parts[i]?.toUpperCase() ?? ""
  if (!geo) return null
  i++

  const phase = parts[i]?.toUpperCase() as PhaseT
  if (!PHASES.has(phase)) return null
  i++

  const funnel = parts[i]?.toUpperCase() as FunnelT
  if (!FUNNELS.has(funnel)) return null
  i++

  const event = parts[i]?.toUpperCase() as EventT
  if (!EVENTS.has(event)) return null
  i++

  const launch_week = parts[i] ?? ""
  if (!/^\d{4}W\d{2}$/i.test(launch_week)) return null
  i++

  let version = ""
  if (i < parts.length && /^v\d+$/i.test(parts[i] ?? "")) {
    version = parts[i]!.toLowerCase()
  }

  return {
    legacy_id,
    name,
    platform,
    persona,
    service,
    geo,
    phase,
    funnel,
    event,
    launch_week: launch_week.toUpperCase(),
    version,
  }
}

export function parseAdSetConventionName(raw: string): ParsedAdSetConvention | null {
  const name = raw.trim()
  if (!name) return null

  let legacy_id: string | null = null
  let body = name
  const firstPart = name.split("_")[0] ?? ""
  if (/^AS\d+$/i.test(firstPart)) {
    legacy_id = firstPart.toUpperCase()
    const firstUnderscore = name.indexOf("_")
    body = firstUnderscore >= 0 ? name.slice(firstUnderscore + 1) : ""
  }

  if (!body) return null

  for (const placement of PLACEMENT_SUFFIXES) {
    const suffix = `_${placement}`
    if (body.endsWith(suffix) || body.toUpperCase() === placement) {
      const audience_src = body.endsWith(suffix)
        ? body.slice(0, -suffix.length)
        : ""
      if (!audience_src) return null
      return {
        legacy_id,
        name,
        audience_src: audience_src.toLowerCase(),
        placement,
      }
    }
  }

  return null
}

export function normalizeAdFormatToken(raw: string): AdFormatT {
  const v = raw.trim()
  const staticMatch = /^Static_(\d+x\d+)$/i.exec(v)
  if (staticMatch) {
    const ratio = staticMatch[1].toLowerCase()
    if (ratio === "9x16") return "Static_9x16"
    if (ratio === "1x1") return "Static_1x1"
    if (ratio === "4x5") return "Static_4x5"
  }
  const videoMatch = /^Video_(\d+s)$/i.exec(v)
  if (videoMatch) {
    const dur = videoMatch[1].toLowerCase()
    if (dur === "15s") return "Video_15s"
    if (dur === "30s") return "Video_30s"
    if (dur === "5s" || dur === "6s") return "Video_15s"
  }
  if (/^carousel$/i.test(v)) return "Carousel"
  if (/^ugc$/i.test(v)) return "UGC"
  if (/^rsa$/i.test(v)) return "RSA"
  return "Static_1x1"
}

export const DEFAULT_BUDGET_MODE: BudgetModeT = "ABO"
