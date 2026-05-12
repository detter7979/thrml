/** Mirrors public.status_t */
export type StatusT = "DRAFT" | "TEST" | "SCALE" | "PAUSED" | "KILLED" | "ARCHIVED"

/** Mirrors public.rec_status_t */
export type RecStatusT =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "MODIFIED"
  | "EXECUTED"
  | "FAILED"
  | "EXPIRED"

/** Mirrors public.rec_kind_t */
export type RecKindT =
  | "CREATE_CAMPAIGN"
  | "CREATE_AD_SET"
  | "CREATE_AD"
  | "ADJUST_BUDGET"
  | "PAUSE_AD"
  | "PAUSE_AD_SET"
  | "PAUSE_CAMPAIGN"
  | "KILL_AD"
  | "KILL_AD_SET"
  | "KILL_CAMPAIGN"
  | "ADVANCE_PHASE"
  | "LAUNCH_LAL"
  | "LAUNCH_TEST"
  | "PROMOTE_WINNER"
  | "GENERATE_CREATIVE"
  | "EXPAND_GEO"

/** Mirrors public.actor_t */
export type ActorT =
  | "HUMAN"
  | "EVALUATOR_AGENT"
  | "META_AGENT"
  | "CREATIVE_AGENT"
  | "REPORTING_AGENT"
  | "SYSTEM"

export type PlatformT = "META" | "GOOG" | "SNAP" | "TIKTOK" | "LINKEDIN"
export type PersonaT = "host" | "guest"
export type ServiceT = "sauna" | "hottub" | "coldplunge" | "multi" | "all"
export type PhaseT = "P1" | "P2" | "P3"
export type FunnelT = "PROSP" | "LAL" | "RT" | "CRM"
export type EventT = "BH" | "HO" | "NL" | "ACT" | "VC" | "IC" | "PUR"
export type BudgetModeT = "ABO" | "CBO"
export type PlacementT =
  | "FEED-STORIES"
  | "REELS"
  | "ADV-PLUS"
  | "SEARCH"
  | "PMAX"
  | "DEMAND-GEN"
export type AdFormatT =
  | "Static_9x16"
  | "Static_1x1"
  | "Static_4x5"
  | "Video_15s"
  | "Video_30s"
  | "Carousel"
  | "UGC"
  | "RSA"
export type AngleT =
  | "income"
  | "community"
  | "idle_space"
  | "thermal"
  | "social_proof"
  | "urgency"
  | "sensory"
  | "ease"
export type CtaT =
  | "list_now"
  | "learn_more"
  | "get_started"
  | "see_how"
  | "book_now"
  | "explore"
  | "join_waitlist"

export type Campaign = {
  id: string
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
  version: string | null
  status: StatusT
  daily_budget_usd: number | null
  budget_mode: BudgetModeT
  priority: string | null
  platform_campaign_id: string | null
  notes: string | null
  created_by: ActorT
  approved_by: string | null
  created_at: string
  updated_at: string
  launched_at: string | null
  paused_at: string | null
  killed_at: string | null
}

export type AdSet = {
  id: string
  legacy_id: string | null
  campaign_id: string
  name: string
  audience_src: string
  placement: PlacementT
  audience_details: string | null
  conv_event: EventT
  budget_weight_pct: number | null
  status: StatusT
  platform_adset_id: string | null
  notes: string | null
  created_by: ActorT
  approved_by: string | null
  created_at: string
  updated_at: string
  launched_at: string | null
  paused_at: string | null
  killed_at: string | null
}

export type Ad = {
  id: string
  legacy_id: string | null
  ad_set_id: string
  campaign_id: string
  name: string
  test_id: string
  variant: "A" | "B" | "C"
  angle: AngleT
  format: AdFormatT
  cta: CtaT
  hook_copy: string | null
  status: StatusT
  gcs_path: string | null
  platform_ad_id: string | null
  conv_event: EventT
  is_winner: boolean
  parent_test_id: string | null
  notes: string | null
  created_by: ActorT
  approved_by: string | null
  created_at: string
  updated_at: string
  launched_at: string | null
  paused_at: string | null
  killed_at: string | null
}

export type Recommendation = {
  id: string
  kind: RecKindT
  status: RecStatusT
  proposed_by: ActorT
  target_campaign_id: string | null
  target_ad_set_id: string | null
  target_ad_id: string | null
  payload: Record<string, unknown>
  evidence: Record<string, unknown> | null
  rationale: string | null
  confidence: number | null
  auto_approve_eligible: boolean
  approved_by: string | null
  approved_at: string | null
  rejected_reason: string | null
  modified_payload: Record<string, unknown> | null
  executed_by_action_id: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export type ActionLog = {
  id: string
  recommendation_id: string | null
  kind: RecKindT
  executed_by: ActorT
  target_campaign_id: string | null
  target_ad_set_id: string | null
  target_ad_id: string | null
  payload: Record<string, unknown>
  platform_request: Record<string, unknown> | null
  platform_response: Record<string, unknown> | null
  success: boolean
  error_message: string | null
  executed_at: string
}

/** Row shape from public.v_pending_recs (flattened pending queue). */
export type PendingRecViewRow = {
  id: string
  kind: RecKindT
  proposed_by: ActorT
  confidence: number | null
  rationale: string | null
  created_at: string
  expires_at: string | null
  campaign_name: string | null
  service: ServiceT | null
  geo: string | null
  phase: PhaseT | null
  ad_set_name: string | null
  ad_name: string | null
  payload: Record<string, unknown>
  evidence: Record<string, unknown> | null
}
