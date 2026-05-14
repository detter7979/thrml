import type { EvaluatorContext, PerformanceDailyRow, RuleResult } from "../types"

const STALE_HOURS = 36

export function rule07StaleDataCheck(ctx: EvaluatorContext): RuleResult[] {
  const out: RuleResult[] = []
  const now = Date.now()
  const staleCut = now - STALE_HOURS * 3600 * 1000

  const byCampaign = new Map<string, PerformanceDailyRow[]>()
  for (const r of ctx.performanceDaily) {
    if (r.level !== "campaign") continue
    const arr = byCampaign.get(r.entity_id) ?? []
    arr.push(r)
    byCampaign.set(r.entity_id, arr)
  }

  const today = new Date().toISOString().slice(0, 10)
  const yest = new Date(now - 86400000).toISOString().slice(0, 10)

  for (const c of ctx.campaigns) {
    const rows = byCampaign.get(c.id) ?? []
    if (!rows.length) continue
    let latest = 0
    for (const r of rows) {
      const t = new Date(`${r.date}T23:59:59Z`).getTime()
      if (t > latest) latest = t
    }
    if (latest < staleCut) {
      out.push({
        kind: "PAUSE_CAMPAIGN",
        target: { campaignId: c.id },
        payload: {
          rule: "07-stale-data-check",
          evaluator_alert: "stale_performance_daily",
          informational: true,
          latest_daily_date: new Date(latest).toISOString().slice(0, 10),
        },
        evidence: { hours_since_latest: (now - latest) / 3600000 },
        rationale: `[DATA FRESHNESS] ${c.legacy_id ?? c.name}: latest performance_daily older than ${STALE_HOURS}h — verify reporting cron / Meta API.`,
        confidence: 0.55,
      })
      continue
    }

    const spendY = rows.filter((r) => r.date === yest).reduce((s, r) => s + (Number(r.spend_usd) || 0), 0)
    const spendT = rows.filter((r) => r.date === today).reduce((s, r) => s + (Number(r.spend_usd) || 0), 0)
    if (spendY > 0 && spendT === 0 && now - new Date(`${today}T20:00:00Z`).getTime() > 0) {
      out.push({
        kind: "PAUSE_CAMPAIGN",
        target: { campaignId: c.id },
        payload: {
          rule: "07-stale-data-check",
          evaluator_alert: "zero_spend_today_after_spend_yesterday",
          informational: true,
        },
        evidence: { spend_yesterday_usd: spendY, spend_today_usd: spendT, dates: { today, yesterday: yest } },
        rationale: `[DATA WARNING] ${c.legacy_id ?? c.name}: spend yesterday ($${spendY.toFixed(2)}) but $0 so far today (UTC) — confirm Meta delivery / ingest.`,
        confidence: 0.56,
      })
    }
  }

  return out
}
