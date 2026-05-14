import type { EvaluatorContext, PerformanceMasterRow, RuleResult } from "../types"
import { isoDateUtcDaysAgo, ruleNumber } from "../types"

/** Rolling 7d blocks over 28d: require last `weeksNeed` blocks each ≥ minEv. */
function rollingBlocksMeet(
  rows: PerformanceMasterRow[],
  campaignId: string,
  convMatch: (r: PerformanceMasterRow) => boolean,
  value: (r: PerformanceMasterRow) => number,
  blocks: number,
  blockDays: number,
  minEv: number,
  weeksNeed: number
): { ok: boolean; close: boolean; sums: number[] } {
  const totalDays = blocks * blockDays
  const from = isoDateUtcDaysAgo(totalDays)
  const sums = Array.from({ length: blocks }, () => 0)
  const t0 = new Date(`${from}T00:00:00Z`).getTime()
  for (const r of rows) {
    if (r.campaign_id !== campaignId || r.level !== "campaign" || r.date < from) continue
    if (!convMatch(r)) continue
    const t = new Date(`${r.date}T00:00:00Z`).getTime()
    const dayIdx = Math.floor((t - t0) / 86400000)
    if (dayIdx < 0 || dayIdx >= totalDays) continue
    const b = Math.floor(dayIdx / blockDays)
    if (b >= 0 && b < blocks) sums[b] += value(r)
  }
  const tail = sums.slice(-weeksNeed)
  const ok = tail.length === weeksNeed && tail.every((x) => x >= minEv)
  const close = tail.length === weeksNeed && tail.every((x) => x >= minEv * 0.75) && !ok
  return { ok, close, sums }
}

export function rule05PhaseAdvancement(ctx: EvaluatorContext): RuleResult[] {
  const minP1 =
    ruleNumber(ctx.rules, "phase_advancement.P1_to_P2", "min_events_per_week", NaN) ||
    ruleNumber(ctx.rules, "phase.P1", "exit_events_per_week", 50)
  const weeksNeed = ruleNumber(ctx.rules, "phase_advancement.P1_to_P2", "min_consecutive_weeks", 2)
  const minP2 =
    ruleNumber(ctx.rules, "phase_advancement.P2_to_P3", "min_events_per_week", NaN) ||
    ruleNumber(ctx.rules, "phase.P2", "exit_events_per_week", 50)
  const weeksNeed2 = ruleNumber(ctx.rules, "phase_advancement.P2_to_P3", "min_consecutive_weeks", 2)

  const out: RuleResult[] = []
  const p2Candidates = ctx.campaigns.filter((c) => c.phase === "P2" && c.persona === "host" && c.status === "TEST")

  for (const c of ctx.campaigns) {
    if (c.persona !== "host" || c.status !== "TEST") continue

    if (c.phase === "P1") {
      const { ok, close, sums } = rollingBlocksMeet(
        ctx.performance,
        c.id,
        (r) => r.conv_event === "BH",
        (r) => Number(r.signup_count) || Number(r.conversions) || 0,
        4,
        7,
        minP1,
        weeksNeed
      )
      const p2Launch = p2Candidates.filter((x) => x.service === c.service).map((x) => ({ id: x.id, name: x.name }))
      if (ok) {
        out.push({
          kind: "ADVANCE_PHASE",
          target: { campaignId: c.id },
          payload: {
            rule: "05-phase-advancement",
            from_phase: "P1",
            to_phase: "P2",
            soft_launch_p2_campaigns: p2Launch,
          },
          evidence: { block_bh_totals: sums, min_per_block: minP1, blocks_required: weeksNeed },
          rationale: `Host ${c.legacy_id ?? c.name} (${c.service}): last ${weeksNeed} rolling 7d blocks each ≥${minP1} BH. Advance P1→P2.`,
          confidence: 0.88,
        })
      } else if (close) {
        out.push({
          kind: "ADVANCE_PHASE",
          target: { campaignId: c.id },
          payload: { rule: "05-phase-advancement", warning: true, from_phase: "P1", to_phase: "P2" },
          evidence: { block_bh_totals: sums },
          rationale: `[Watchlist] ${c.legacy_id ?? c.name} approaching P1→P2 BH gate (blocks: ${sums.map((x) => x.toFixed(0)).join(", ")}).`,
          confidence: 0.5,
        })
      }
    }

    if (c.phase === "P2") {
      const { ok, close, sums } = rollingBlocksMeet(
        ctx.performance,
        c.id,
        (r) => r.conv_event === "HO",
        (r) => Number(r.onboard_count) || Number(r.conversions) || 0,
        4,
        7,
        minP2,
        weeksNeed2
      )
      const p3Drafts = ctx.campaigns.filter((x) => x.phase === "P3" && x.service === c.service)
      if (ok) {
        out.push({
          kind: "ADVANCE_PHASE",
          target: { campaignId: c.id },
          payload: {
            rule: "05-phase-advancement",
            from_phase: "P2",
            to_phase: "P3",
            matching_p3_campaigns: p3Drafts.map((x) => ({ id: x.id, name: x.name, status: x.status })),
          },
          evidence: { block_ho_totals: sums, min_per_block: minP2, blocks_required: weeksNeed2 },
          rationale: `Host ${c.legacy_id ?? c.name}: last ${weeksNeed2} rolling 7d blocks each ≥${minP2} HO. Advance P2→P3.`,
          confidence: 0.87,
        })
      } else if (close) {
        out.push({
          kind: "ADVANCE_PHASE",
          target: { campaignId: c.id },
          payload: { rule: "05-phase-advancement", warning: true, from_phase: "P2", to_phase: "P3" },
          evidence: { block_ho_totals: sums },
          rationale: `[Watchlist] ${c.legacy_id ?? c.name} close to P2→P3 HO gate.`,
          confidence: 0.48,
        })
      }
    }
  }

  return out
}
